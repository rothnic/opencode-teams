import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import { WorkflowMonitor } from '../src/operations/workflow-monitor';
import { TeamConfigSchema } from '../src/types/schemas';
import { readValidatedJSON, writeAtomicJSON } from '../src/utils/fs-atomic';
import { getTeamConfigPath } from '../src/utils/storage-paths';

let testDir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'opencode-teams-wf-'));
  savedEnv.OPENCODE_PROJECT_ROOT = process.env.OPENCODE_PROJECT_ROOT;
  savedEnv.OPENCODE_TEAMS_GLOBAL_DIR = process.env.OPENCODE_TEAMS_GLOBAL_DIR;
  savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
  savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
  process.env.OPENCODE_PROJECT_ROOT = testDir;
  process.env.OPENCODE_TEAMS_GLOBAL_DIR = join(testDir, 'global-config');
  process.env.OPENCODE_AGENT_ID = 'leader-1';
  process.env.OPENCODE_AGENT_NAME = 'Leader';
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  process.env.OPENCODE_PROJECT_ROOT = savedEnv.OPENCODE_PROJECT_ROOT;
  process.env.OPENCODE_TEAMS_GLOBAL_DIR = savedEnv.OPENCODE_TEAMS_GLOBAL_DIR;
  process.env.OPENCODE_AGENT_ID = savedEnv.OPENCODE_AGENT_ID;
  process.env.OPENCODE_AGENT_NAME = savedEnv.OPENCODE_AGENT_NAME;
});

function createTeamWithWorkflow(teamName: string, wfOverrides = {}) {
  TeamOperations.spawnTeam(teamName, { agentId: 'leader-1' });
  TeamOperations.requestJoin(teamName, {
    agentId: 'worker-1',
    agentName: 'W1',
    agentType: 'worker',
  });

  const configPath = getTeamConfigPath(teamName);
  const config = readValidatedJSON(configPath, TeamConfigSchema);
  config.workflowConfig = {
    enabled: true,
    taskThreshold: 3,
    workerRatio: 2.0,
    cooldownSeconds: 300,
    ...wfOverrides,
  };
  writeAtomicJSON(configPath, config, TeamConfigSchema);
}

describe('WorkflowMonitor.evaluate', () => {
  it('should return null for nonexistent team', () => {
    expect(WorkflowMonitor.evaluate('nonexistent')).toBeNull();
  });

  it('should return null when workflow not enabled', () => {
    TeamOperations.spawnTeam('no-wf', { agentId: 'leader-1' });
    expect(WorkflowMonitor.evaluate('no-wf')).toBeNull();
  });

  it('should return null when explicitly disabled', () => {
    createTeamWithWorkflow('disabled-wf', { enabled: false });
    expect(WorkflowMonitor.evaluate('disabled-wf')).toBeNull();
  });

  it('should return null when below task threshold', () => {
    createTeamWithWorkflow('low-tasks', { taskThreshold: 5 });
    TaskOperations.createTask('low-tasks', { title: 'Task 1' });
    TaskOperations.createTask('low-tasks', { title: 'Task 2' });

    expect(WorkflowMonitor.evaluate('low-tasks')).toBeNull();
  });

  it('should return null when ratio is below threshold', () => {
    createTeamWithWorkflow('low-ratio', { taskThreshold: 2, workerRatio: 10.0 });
    TaskOperations.createTask('low-ratio', { title: 'Task 1' });
    TaskOperations.createTask('low-ratio', { title: 'Task 2' });
    TaskOperations.createTask('low-ratio', { title: 'Task 3' });

    expect(WorkflowMonitor.evaluate('low-ratio')).toBeNull();
  });

  it('should return suggestion when threshold exceeded', () => {
    createTeamWithWorkflow('high-load', { taskThreshold: 2, workerRatio: 1.5 });
    TaskOperations.createTask('high-load', { title: 'Task 1' });
    TaskOperations.createTask('high-load', { title: 'Task 2' });
    TaskOperations.createTask('high-load', { title: 'Task 3' });

    const suggestion = WorkflowMonitor.evaluate('high-load');
    expect(suggestion).not.toBeNull();
    expect(suggestion!.unblockedTasks).toBe(3);
    expect(suggestion!.activeWorkers).toBe(1);
    expect(suggestion!.ratio).toBe(3);
    expect(suggestion!.message).toContain('Backlog alert');
  });

  it('should not count dependency-blocked tasks as unblocked', () => {
    createTeamWithWorkflow('blocked-deps', { taskThreshold: 2, workerRatio: 1.5 });
    const t1 = TaskOperations.createTask('blocked-deps', { title: 'Task 1' });
    TaskOperations.createTask('blocked-deps', {
      title: 'Task 2 (blocked)',
      dependencies: [t1.id],
    });
    TaskOperations.createTask('blocked-deps', {
      title: 'Task 3 (blocked)',
      dependencies: [t1.id],
    });

    const suggestion = WorkflowMonitor.evaluate('blocked-deps');
    expect(suggestion).toBeNull();
  });

  it('should return null when no workers (only leader)', () => {
    TeamOperations.spawnTeam('no-workers', { agentId: 'leader-1' });
    const configPath = getTeamConfigPath('no-workers');
    const config = readValidatedJSON(configPath, TeamConfigSchema);
    config.workflowConfig = {
      enabled: true,
      taskThreshold: 1,
      workerRatio: 1.0,
      cooldownSeconds: 300,
    };
    writeAtomicJSON(configPath, config, TeamConfigSchema);

    TaskOperations.createTask('no-workers', { title: 'Task 1' });
    TaskOperations.createTask('no-workers', { title: 'Task 2' });

    expect(WorkflowMonitor.evaluate('no-workers')).toBeNull();
  });
});

describe('WorkflowMonitor cooldown', () => {
  it('should suppress suggestion during cooldown', () => {
    createTeamWithWorkflow('cooldown-team', {
      taskThreshold: 2,
      workerRatio: 1.5,
      cooldownSeconds: 600,
      lastSuggestionAt: new Date().toISOString(),
    });
    TaskOperations.createTask('cooldown-team', { title: 'Task 1' });
    TaskOperations.createTask('cooldown-team', { title: 'Task 2' });
    TaskOperations.createTask('cooldown-team', { title: 'Task 3' });

    expect(WorkflowMonitor.evaluate('cooldown-team')).toBeNull();
  });

  it('should allow suggestion after cooldown expires', () => {
    const expired = new Date(Date.now() - 700_000).toISOString();
    createTeamWithWorkflow('expired-cooldown', {
      taskThreshold: 2,
      workerRatio: 1.5,
      cooldownSeconds: 600,
      lastSuggestionAt: expired,
    });
    TaskOperations.createTask('expired-cooldown', { title: 'Task 1' });
    TaskOperations.createTask('expired-cooldown', { title: 'Task 2' });
    TaskOperations.createTask('expired-cooldown', { title: 'Task 3' });

    const suggestion = WorkflowMonitor.evaluate('expired-cooldown');
    expect(suggestion).not.toBeNull();
  });
});

describe('WorkflowMonitor.emitSuggestion', () => {
  it('should send message to leader and update lastSuggestionAt', () => {
    createTeamWithWorkflow('emit-team', { taskThreshold: 2, workerRatio: 1.5 });
    TaskOperations.createTask('emit-team', { title: 'Task 1' });
    TaskOperations.createTask('emit-team', { title: 'Task 2' });
    TaskOperations.createTask('emit-team', { title: 'Task 3' });

    const suggestion = WorkflowMonitor.evaluate('emit-team');
    expect(suggestion).not.toBeNull();

    WorkflowMonitor.emitSuggestion('emit-team', suggestion!);

    const messages = TeamOperations.readMessages('emit-team', 'leader-1');
    expect(messages.length).toBe(1);
    expect(messages[0].message).toContain('Backlog alert');

    const config = readValidatedJSON(getTeamConfigPath('emit-team'), TeamConfigSchema);
    expect(config.workflowConfig?.lastSuggestionAt).toBeDefined();
  });
});

describe('Task completion triggers workflow evaluation', () => {
  it('should not fail task update even if workflow check runs', () => {
    createTeamWithWorkflow('task-trigger', { taskThreshold: 2, workerRatio: 1.5 });
    const task = TaskOperations.createTask('task-trigger', { title: 'Completable' });
    TaskOperations.claimTask('task-trigger', task.id, 'worker-1');

    const completed = TaskOperations.updateTask('task-trigger', task.id, {
      status: 'completed',
    });
    expect(completed.status).toBe('completed');
  });
});
