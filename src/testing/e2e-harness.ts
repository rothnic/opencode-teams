import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../operations/task';
import { TeamOperations } from '../operations/team';
import type { TeamConfig } from '../types/index';
import type { E2EAgentRole, E2EHarnessConfig } from './scenarios/types';

export function createTestEnvironment(config?: Partial<E2EHarnessConfig>): {
  tempDir: string;
  config: E2EHarnessConfig;
  savedEnv: Record<string, string | undefined>;
} {
  const tempDir = mkdtempSync(join(tmpdir(), 'opencode-e2e-harness-'));

  const savedEnv: Record<string, string | undefined> = {
    OPENCODE_TEAMS_DIR: process.env.OPENCODE_TEAMS_DIR,
    OPENCODE_AGENT_ID: process.env.OPENCODE_AGENT_ID,
    OPENCODE_AGENT_NAME: process.env.OPENCODE_AGENT_NAME,
    OPENCODE_AGENT_TYPE: process.env.OPENCODE_AGENT_TYPE,
  };

  process.env.OPENCODE_TEAMS_DIR = tempDir;
  delete process.env.OPENCODE_AGENT_ID;
  delete process.env.OPENCODE_AGENT_NAME;
  delete process.env.OPENCODE_AGENT_TYPE;

  const defaultConfig: E2EHarnessConfig = {
    model: 'google/antigravity-gemini-3-flash',
    recording: false,
    scenarioTimeoutMs: 300_000,
    setupTimeoutMs: 60_000,
    cleanupTimeoutMs: 30_000,
    maxReworkCycles: 3,
    ...config,
  };

  return {
    tempDir,
    config: defaultConfig,
    savedEnv,
  };
}

export function destroyTestEnvironment(env: {
  tempDir: string;
  savedEnv: Record<string, string | undefined>;
}): void {
  try {
    if (existsSync(env.tempDir)) {
      rmSync(env.tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`Warning: Failed to cleanup temp dir ${env.tempDir}:`, error);
  }

  for (const [key, value] of Object.entries(env.savedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

export function setupTeamWithAgents(
  teamName: string,
  agents: E2EAgentRole[],
  projectRoot?: string,
): {
  team: TeamConfig;
  registeredAgents: Array<{ agentId: string; name: string; role: string }>;
} {
  if (projectRoot) {
    const _p = projectRoot;
  }
  if (agents.length === 0) {
    throw new Error('At least one agent is required');
  }

  const planner = agents.find((a) => a.role === 'planner') || agents[0];
  const otherAgents = agents.filter((a) => a !== planner);

  const leaderInfo = {
    agentId: `agent-${planner.name.toLowerCase().replace(/\s+/g, '-')}`,
    agentName: planner.name,
    agentType: planner.role,
  };

  const team = TeamOperations.spawnTeam(teamName, leaderInfo);
  const registeredAgents = [{ agentId: team.leader, name: planner.name, role: planner.role }];

  for (const agent of otherAgents) {
    const agentId = `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
    const member = TeamOperations.requestJoin(teamName, {
      agentId,
      agentName: agent.name,
      agentType: agent.role,
    });
    registeredAgents.push({ agentId: member.agentId, name: agent.name, role: agent.role });
  }

  const updatedTeam = TeamOperations.getTeamInfo(teamName);

  return {
    team: updatedTeam,
    registeredAgents,
  };
}

export async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
  intervalMs: number = 250,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) {
      return true;
    }
    await Bun.sleep(intervalMs);
  }
  return false;
}

export function assertAllTasksCompleted(
  teamName: string,
  projectRoot?: string,
): { allCompleted: boolean; tasks: Array<{ id: string; title: string; status: string }> } {
  if (projectRoot) {
    const _p = projectRoot;
  }
  const tasks = TaskOperations.getTasks(teamName);

  const allCompleted = tasks.length > 0 && tasks.every((t) => t.status === 'completed');

  return {
    allCompleted,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
  };
}

export function assertNoResidualState(tempDir: string): {
  clean: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (existsSync(tempDir)) {
    issues.push(`Temp directory ${tempDir} still exists`);
  }

  return {
    clean: issues.length === 0,
    issues,
  };
}
