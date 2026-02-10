import { readdirSync } from 'node:fs';
import {
  type DispatchAction,
  type DispatchCondition,
  type DispatchEvent,
  type DispatchEventType,
  type DispatchLogEntry,
  TaskSchema,
  TeamConfigSchema,
} from '../types/schemas';
import { lockedUpdate, readValidatedJSON } from '../utils/fs-atomic';
import {
  fileExists,
  getTeamConfigPath,
  getTeamLockPath,
  getTeamTasksDir,
} from '../utils/storage-paths';
import { AgentOperations } from './agent';
import { EventBus } from './event-bus';
import { TaskOperations } from './task';
import { TeamOperations } from './team';

const DISPATCH_LOG_MAX = 500;

export const DispatchEngine = {
  /**
   * Maximum recursion depth to prevent circular event loops.
   */
  _dispatchDepth: 0,
  _maxDepth: 3,

  /**
   * Evaluate an event against all enabled dispatch rules for its team.
   */
  async evaluate(event: DispatchEvent): Promise<void> {
    if (DispatchEngine._dispatchDepth >= DispatchEngine._maxDepth) {
      console.warn(`[DispatchEngine] Max depth reached, skipping event: ${event.type}`);
      return;
    }

    DispatchEngine._dispatchDepth++;
    try {
      const configPath = getTeamConfigPath(event.teamName);
      if (!fileExists(configPath)) {
        return;
      }

      let teamConfig;
      try {
        teamConfig = readValidatedJSON(configPath, TeamConfigSchema);
      } catch (error) {
        console.warn(`[DispatchEngine] Failed to read team config for ${event.teamName}: ${error}`);
        return;
      }

      const rules = teamConfig.dispatchRules
        .filter((rule) => rule.enabled && rule.eventType === event.type)
        .sort((a, b) => a.priority - b.priority);

      for (const rule of rules) {
        let conditionMet = true;
        if (rule.condition) {
          conditionMet = evaluateCondition(rule.condition, event, event.teamName);
        }

        if (conditionMet) {
          const result = await executeAction(rule.action, event, event.teamName);

          const logEntry: DispatchLogEntry = {
            id: globalThis.crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ruleId: rule.id,
            eventType: event.type,
            success: result.success,
            details: result.details,
          };

          appendDispatchLog(event.teamName, logEntry);
        }
      }
    } catch (error) {
      console.error(`[DispatchEngine] Error evaluating event ${event.id}:`, error);
    } finally {
      DispatchEngine._dispatchDepth--;
    }
  },
};

function evaluateCondition(
  condition: DispatchCondition,
  event: DispatchEvent,
  teamName: string,
): boolean {
  if (condition.type === 'simple_match') {
    const fieldValue = getNestedField(event.payload, condition.field || '');
    return compare(fieldValue, condition.operator, condition.value);
  }

  if (condition.type === 'resource_count') {
    const count = getResourceCount(condition.resource, teamName);
    return compare(count, condition.operator, condition.value);
  }

  return false;
}

function getNestedField(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return undefined;
  return path
    .split('.')
    .reduce((o, key) => (o && typeof o === 'object' ? (o as any)[key] : undefined), obj);
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  if (typeof right === 'number') {
    const numLeft = Number(left);
    if (isNaN(numLeft)) return false;

    switch (operator) {
      case 'eq':
        return numLeft === right;
      case 'neq':
        return numLeft !== right;
      case 'gt':
        return numLeft > right;
      case 'lt':
        return numLeft < right;
      case 'gte':
        return numLeft >= right;
      case 'lte':
        return numLeft <= right;
      default:
        return false;
    }
  }

  const strLeft = String(left);
  const strRight = String(right);

  switch (operator) {
    case 'eq':
      return strLeft === strRight;
    case 'neq':
      return strLeft !== strRight;
    case 'gt':
      return strLeft > strRight;
    case 'lt':
      return strLeft < strRight;
    case 'gte':
      return strLeft >= strRight;
    case 'lte':
      return strLeft <= strRight;
    default:
      return false;
  }
}

function getResourceCount(resource: string | undefined, teamName: string): number {
  if (resource === 'unblocked_tasks') {
    return countUnblockedPendingTasks(teamName);
  }
  if (resource === 'active_agents') {
    const configPath = getTeamConfigPath(teamName);
    if (!fileExists(configPath)) return 0;
    try {
      const config = readValidatedJSON(configPath, TeamConfigSchema);
      return Math.max(0, config.members.length - 1);
    } catch {
      return 0;
    }
  }
  return 0;
}

function countUnblockedPendingTasks(teamName: string): number {
  const tasksDir = getTeamTasksDir(teamName);
  let count = 0;

  try {
    const files = readdirSync(tasksDir).filter((f) => f.endsWith('.json') && f !== '.lock');
    for (const file of files) {
      try {
        const task = readValidatedJSON(`${tasksDir}/${file}`, TaskSchema);
        if (task.status === 'pending') {
          const allDepsComplete = task.dependencies.every((depId) => {
            try {
              const depPath = `${tasksDir}/${depId}.json`;
              if (!fileExists(depPath)) return true;

              const dep = readValidatedJSON(depPath, TaskSchema);
              return dep.status === 'completed';
            } catch {
              return true;
            }
          });
          if (allDepsComplete) count++;
        }
      } catch {
        // skip unreadable
      }
    }
  } catch {
    return 0;
  }
  return count;
}

async function executeAction(
  action: DispatchAction,
  event: DispatchEvent,
  teamName: string,
): Promise<{ success: boolean; details: string }> {
  try {
    switch (action.type) {
      case 'assign_task':
        return assignTaskAction(event, teamName);
      case 'notify_leader':
        return notifyLeaderAction(event, teamName, action.params);
      case 'log':
        return logAction(event, action.params);
      default:
        return { success: false, details: `Unknown action type: ${(action as any).type}` };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, details: `Action failed: ${msg}` };
  }
}

async function assignTaskAction(
  event: DispatchEvent,
  teamName: string,
): Promise<{ success: boolean; details: string }> {
  const agents = AgentOperations.listAgents({ teamName });
  const idleAgents = agents.filter((a) => a.status === 'idle' && a.isActive);

  if (idleAgents.length === 0) {
    return { success: false, details: 'No idle agents available' };
  }

  const tasks = TaskOperations.getTasks(teamName, { status: 'pending' });
  const unblockedTasks = tasks.filter((task) =>
    TaskOperations.areDependenciesMet(teamName, task.id),
  );

  if (unblockedTasks.length === 0) {
    return { success: false, details: 'No unblocked pending tasks available' };
  }

  const priorityMap: Record<string, number> = { high: 3, normal: 2, low: 1 };
  unblockedTasks.sort((a, b) => {
    const pA = priorityMap[a.priority] || 2;
    const pB = priorityMap[b.priority] || 2;
    if (pA !== pB) return pB - pA;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const taskToAssign = unblockedTasks[0];
  const agentToAssign = idleAgents[0];

  try {
    TaskOperations.claimTask(teamName, taskToAssign.id, agentToAssign.id);

    return {
      success: true,
      details: `Assigned task ${taskToAssign.id} to agent ${agentToAssign.id}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, details: `Failed to claim task: ${msg}` };
  }
}

function notifyLeaderAction(
  event: DispatchEvent,
  teamName: string,
  params?: Record<string, unknown>,
): { success: boolean; details: string } {
  try {
    const configPath = getTeamConfigPath(teamName);
    if (!fileExists(configPath)) {
      return { success: false, details: 'Team config not found' };
    }
    const config = readValidatedJSON(configPath, TeamConfigSchema);

    const message = (params?.message as string) || `Event ${event.type} occurred`;

    TeamOperations._sendTypedMessage(teamName, config.leader, message, 'plain', 'dispatch-engine');

    return { success: true, details: `Notified leader ${config.leader}` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, details: `Failed to notify leader: ${msg}` };
  }
}

function logAction(
  event: DispatchEvent,
  params?: Record<string, unknown>,
): { success: boolean; details: string } {
  console.log(`[DispatchLog] Event: ${event.type} Team: ${event.teamName}`, params);
  return { success: true, details: 'Logged to console' };
}

function appendDispatchLog(teamName: string, entry: DispatchLogEntry, projectRoot?: string): void {
  const configPath = getTeamConfigPath(teamName, projectRoot);
  const lockPath = getTeamLockPath(teamName, projectRoot);

  if (!fileExists(configPath)) return;

  try {
    lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      const log = [...(config.dispatchLog || []), entry];
      const trimmed =
        log.length > DISPATCH_LOG_MAX ? log.slice(log.length - DISPATCH_LOG_MAX) : log;
      return { ...config, dispatchLog: trimmed };
    });
  } catch (error) {
    console.warn(`[DispatchEngine] Failed to append log: ${error}`);
  }
}

export function initDispatchEngine(): void {
  const eventTypes: DispatchEventType[] = [
    'task.created',
    'task.completed',
    'task.unblocked',
    'agent.idle',
    'agent.terminated',
    'session.idle',
  ];

  for (const eventType of eventTypes) {
    EventBus.subscribe(eventType, async (event) => {
      await DispatchEngine.evaluate(event);
    });
  }
}
