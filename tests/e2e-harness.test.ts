import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import {
  assertAllTasksCompleted,
  assertNoResidualState,
  createTestEnvironment,
  destroyTestEnvironment,
  setupTeamWithAgents,
  waitForCondition,
} from '../src/testing/e2e-harness';
import type { E2EAgentRole } from '../src/testing/scenarios/types';

describe('E2E Harness', () => {
  let env:
    | {
        tempDir: string;
        savedEnv: Record<string, string | undefined>;
      }
    | undefined;

  beforeEach(() => {});

  afterEach(() => {
    if (env) {
      destroyTestEnvironment(env);
      env = undefined;
    }
  });

  it('createTestEnvironment sets OPENCODE_TEAMS_DIR to a temp dir that exists', () => {
    env = createTestEnvironment();
    expect(process.env.OPENCODE_TEAMS_DIR).toBe(env.tempDir);
    expect(existsSync(env.tempDir)).toBe(true);
    expect(env.tempDir).toContain('opencode-e2e-harness-');
  });

  it('createTestEnvironment saves previous env vars', () => {
    const originalTeamsDir = process.env.OPENCODE_TEAMS_DIR;
    process.env.OPENCODE_TEAMS_DIR = '/original/path';

    env = createTestEnvironment();

    expect(env.savedEnv.OPENCODE_TEAMS_DIR).toBe('/original/path');

    if (originalTeamsDir === undefined) {
      delete process.env.OPENCODE_TEAMS_DIR;
    } else {
      process.env.OPENCODE_TEAMS_DIR = originalTeamsDir;
    }
  });

  it('destroyTestEnvironment removes temp dir and restores env', () => {
    process.env.OPENCODE_TEAMS_DIR = '/original/path';
    env = createTestEnvironment();

    const tempDir = env.tempDir;
    expect(existsSync(tempDir)).toBe(true);
    expect(process.env.OPENCODE_TEAMS_DIR).toBe(tempDir);

    destroyTestEnvironment(env);

    expect(existsSync(tempDir)).toBe(false);
    expect(process.env.OPENCODE_TEAMS_DIR).toBe('/original/path');

    env = undefined;
  });

  it('setupTeamWithAgents creates a team with the correct number of members', () => {
    env = createTestEnvironment();
    const agents: E2EAgentRole[] = [
      { role: 'planner', name: 'Alice' },
      { role: 'builder', name: 'Bob' },
      { role: 'reviewer', name: 'Charlie' },
    ];

    const { team, registeredAgents } = setupTeamWithAgents('test-team', agents);

    expect(team.name).toBe('test-team');
    expect(team.members.length).toBe(3);
    expect(registeredAgents.length).toBe(3);
  });

  it('setupTeamWithAgents makes the planner the leader', () => {
    env = createTestEnvironment();
    const agents: E2EAgentRole[] = [
      { role: 'builder', name: 'Bob' },
      { role: 'planner', name: 'Alice' },
    ];

    const { team } = setupTeamWithAgents('test-team', agents);

    const leaderMember = team.members.find((m) => m.agentId === team.leader);
    expect(leaderMember?.agentName).toBe('Alice');
    expect(leaderMember?.agentType).toBe('planner');
  });

  it('waitForCondition returns true when condition is met immediately', async () => {
    env = createTestEnvironment();
    const result = await waitForCondition(() => true, 1000);
    expect(result).toBe(true);
  });

  it('waitForCondition returns false on timeout', async () => {
    env = createTestEnvironment();
    const result = await waitForCondition(() => false, 100, 10);
    expect(result).toBe(false);
  });

  it('assertAllTasksCompleted returns true when all tasks completed', () => {
    env = createTestEnvironment();
    const teamName = 'task-team';
    TeamOperations.spawnTeam(teamName);

    const t1 = TaskOperations.createTask(teamName, { title: 'T1' });
    const t2 = TaskOperations.createTask(teamName, { title: 'T2' });

    TaskOperations.claimTask(teamName, t1.id, 'worker-1');
    TaskOperations.updateTask(teamName, t1.id, { status: 'completed' });

    TaskOperations.claimTask(teamName, t2.id, 'worker-1');
    TaskOperations.updateTask(teamName, t2.id, { status: 'completed' });

    const result = assertAllTasksCompleted(teamName);

    expect(result.allCompleted).toBe(true);
    expect(result.tasks.length).toBe(2);
    expect(result.tasks[0].status).toBe('completed');
  });

  it('assertAllTasksCompleted returns false when some tasks pending', () => {
    env = createTestEnvironment();
    const teamName = 'task-team-pending';
    TeamOperations.spawnTeam(teamName);

    const t1 = TaskOperations.createTask(teamName, { title: 'T1' });

    TaskOperations.claimTask(teamName, t1.id, 'worker-1');
    TaskOperations.updateTask(teamName, t1.id, { status: 'completed' });

    TaskOperations.createTask(teamName, { title: 'T2' });

    const result = assertAllTasksCompleted(teamName);
    expect(result.allCompleted).toBe(false);
    expect(result.tasks.some((t) => t.status === 'pending')).toBe(true);
  });

  it('assertNoResidualState returns clean=true when dir is removed', () => {
    env = createTestEnvironment();
    const tempDir = env.tempDir;

    rmSync(tempDir, { recursive: true, force: true });

    const result = assertNoResidualState(tempDir);
    expect(result.clean).toBe(true);
    expect(result.issues.length).toBe(0);

    env = undefined;
  });
});
