import { readdirSync } from 'node:fs';
import { TaskSchema, TeamConfigSchema } from '../types/schemas';
import { readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import { fileExists, getTeamConfigPath, getTeamTasksDir } from '../utils/storage-paths';
import { TeamOperations } from './team';

export interface WorkflowSuggestion {
  teamName: string;
  unblockedTasks: number;
  activeWorkers: number;
  ratio: number;
  message: string;
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
          const allDepsComplete = task.dependencies.every((depId: string) => {
            const depPath = `${tasksDir}/${depId}.json`;
            if (!fileExists(depPath)) return true;
            try {
              const dep = readValidatedJSON(depPath, TaskSchema);
              return dep.status === 'completed';
            } catch {
              return true;
            }
          });
          if (allDepsComplete) count++;
        }
      } catch {
        // skip unreadable task
      }
    }
  } catch {
    // skip missing tasks dir
  }

  return count;
}

export const WorkflowMonitor = {
  evaluate: (teamName: string): WorkflowSuggestion | null => {
    const configPath = getTeamConfigPath(teamName);
    if (!fileExists(configPath)) return null;

    const teamConfig = readValidatedJSON(configPath, TeamConfigSchema);
    const wfConfig = teamConfig.workflowConfig;

    if (!wfConfig?.enabled) return null;

    if (wfConfig.lastSuggestionAt) {
      const lastSuggestion = new Date(wfConfig.lastSuggestionAt).getTime();
      const cooldownMs = wfConfig.cooldownSeconds * 1000;
      if (Date.now() - lastSuggestion < cooldownMs) {
        return null;
      }
    }

    const unblockedTasks = countUnblockedPendingTasks(teamName);
    const activeWorkers = teamConfig.members.length - 1;
    if (activeWorkers <= 0) return null;

    const ratio = unblockedTasks / activeWorkers;

    if (unblockedTasks < wfConfig.taskThreshold) return null;
    if (ratio < wfConfig.workerRatio) return null;

    return {
      teamName,
      unblockedTasks,
      activeWorkers,
      ratio,
      message:
        `Backlog alert: ${unblockedTasks} unblocked tasks with ${activeWorkers} active workers ` +
        `(ratio: ${ratio.toFixed(1)}x). Consider spawning additional workers.`,
    };
  },

  emitSuggestion: (teamName: string, suggestion: WorkflowSuggestion): void => {
    const configPath = getTeamConfigPath(teamName);
    const config = readValidatedJSON(configPath, TeamConfigSchema);

    TeamOperations._sendTypedMessage(
      teamName,
      config.leader,
      suggestion.message,
      'task_assignment',
      'workflow-monitor',
    );

    if (config.workflowConfig) {
      config.workflowConfig.lastSuggestionAt = new Date().toISOString();
      writeAtomicJSON(configPath, config, TeamConfigSchema);
    }
  },
};
