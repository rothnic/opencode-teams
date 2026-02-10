import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../operations/task';
import { TeamOperations } from '../operations/team';
import { TmuxOperations } from '../operations/tmux';
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
  _projectRoot?: string,
): {
  team: TeamConfig;
  registeredAgents: Array<{ agentId: string; name: string; role: string }>;
} {
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
  _projectRoot?: string,
): { allCompleted: boolean; tasks: Array<{ id: string; title: string; status: string }> } {
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

/**
 * Capture terminal output from a tmux pane and write to a recording file.
 *
 * @param paneId - tmux pane ID (e.g., "%42")
 * @param outputDir - directory to write recording files
 * @param label - descriptive label for the recording file name
 * @param lines - number of lines to capture (default: 500)
 * @returns path to the recording file, or null if capture failed
 */
export function captureRecording(
  paneId: string,
  outputDir: string,
  label: string,
  lines = 500,
): string | null {
  try {
    mkdirSync(outputDir, { recursive: true });
    const output = TmuxOperations.capturePaneOutput(paneId, lines);
    if (!output) return null;
    const filename = `${label}-${Date.now()}.txt`;
    const filepath = join(outputDir, filename);
    writeFileSync(filepath, output, 'utf-8');
    return filepath;
  } catch {
    return null;
  }
}

/**
 * Capture recordings for all agents with pane IDs.
 * Returns array of recording file paths.
 */
export function captureAllRecordings(
  agents: Array<{ name: string; paneId?: string }>,
  outputDir: string,
): string[] {
  const recordings: string[] = [];
  for (const agent of agents) {
    if (!agent.paneId) continue;
    const path = captureRecording(agent.paneId, outputDir, agent.name);
    if (path) recordings.push(path);
  }
  return recordings;
}
