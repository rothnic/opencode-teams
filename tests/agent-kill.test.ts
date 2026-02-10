import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentOperations } from '../src/operations/agent';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import type { AgentState } from '../src/types/schemas';
import { InboxSchema, TeamConfigSchema } from '../src/types/schemas';
import { allocateColor } from '../src/utils/color-pool';
import { readValidatedJSON } from '../src/utils/fs-atomic';
import { getAgentInboxPath, getTeamConfigPath } from '../src/utils/storage-paths';

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-kill-test-'));
  process.env.OPENCODE_PROJECT_ROOT = tmpDir;
});

afterAll(() => {
  delete process.env.OPENCODE_PROJECT_ROOT;
  rmSync(tmpDir, { recursive: true, force: true });
});

function createTestTeam(teamName: string): void {
  TeamOperations.spawnTeam(teamName, {
    agentId: 'leader-1',
    agentName: 'Leader',
    agentType: 'leader',
  });
}

function createTestAgent(
  teamName: string,
  agentId: string,
  overrides: Partial<AgentState> = {},
): AgentState {
  const now = new Date().toISOString();
  const color = allocateColor(agentId);
  const agent: AgentState = {
    id: agentId,
    name: overrides.name || `agent-${agentId.slice(0, 8)}`,
    teamName,
    role: overrides.role || 'worker',
    model: 'test-model',
    sessionId: overrides.sessionId || `session-${agentId}`,
    serverPort: 28001,
    cwd: tmpDir,
    color,
    status: overrides.status || 'active',
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    createdAt: now,
    heartbeatTs: overrides.heartbeatTs || now,
    consecutiveMisses: overrides.consecutiveMisses || 0,
    sessionRotationCount: 0,
    ...overrides,
  };
  agent.id = agentId;
  agent.teamName = teamName;
  return AgentOperations.registerAgent(agent);
}

describe('AgentOperations - Kill', () => {
  let testTeam: string;
  let teamCounter = 0;

  beforeEach(() => {
    teamCounter++;
    testTeam = `kill-team-${teamCounter}`;
    createTestTeam(testTeam);
  });

  describe('forceKill', () => {
    it('returns error for non-existent agent', async () => {
      const result = await AgentOperations.forceKill({
        teamName: testTeam,
        agentId: 'nonexistent',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.reassignedTasks).toEqual([]);
    });

    it('returns error for already terminated agent', async () => {
      const agent = createTestAgent(testTeam, `terminated-${teamCounter}`);
      AgentOperations.updateAgentState(agent.id, {
        status: 'terminated',
        isActive: false,
        terminatedAt: new Date().toISOString(),
      });

      const result = await AgentOperations.forceKill({
        teamName: testTeam,
        agentId: agent.id,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already terminated');
    });

    it('terminates active agent and updates state', async () => {
      const agent = createTestAgent(testTeam, `active-kill-${teamCounter}`);

      const result = await AgentOperations.forceKill({
        teamName: testTeam,
        agentId: agent.id,
        reason: 'testing',
      });

      expect(result.success).toBe(true);

      const updated = AgentOperations.getAgentState(agent.id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('terminated');
      expect(updated!.isActive).toBe(false);
      expect(updated!.terminatedAt).toBeDefined();
      expect(updated!.lastError).toContain('Force killed: testing');
    });

    it('reassigns in_progress tasks back to pending', async () => {
      const agentId = `task-kill-${teamCounter}`;
      createTestAgent(testTeam, agentId);

      const task1 = TaskOperations.createTask(testTeam, { title: 'Task 1' });
      TaskOperations.claimTask(testTeam, task1.id, agentId);

      const task2 = TaskOperations.createTask(testTeam, { title: 'Task 2' });
      TaskOperations.claimTask(testTeam, task2.id, agentId);

      const completedTask = TaskOperations.createTask(testTeam, { title: 'Completed' });
      TaskOperations.claimTask(testTeam, completedTask.id, agentId);
      TaskOperations.updateTask(testTeam, completedTask.id, { status: 'completed' });

      const result = await AgentOperations.forceKill({
        teamName: testTeam,
        agentId,
      });

      expect(result.success).toBe(true);
      expect(result.reassignedTasks).toHaveLength(2);
      expect(result.reassignedTasks).toContain(task1.id);
      expect(result.reassignedTasks).toContain(task2.id);

      const reassigned1 = TaskOperations.getTask(testTeam, task1.id);
      expect(reassigned1.status).toBe('pending');
      expect(reassigned1.owner).toBeUndefined();

      const notReassigned = TaskOperations.getTask(testTeam, completedTask.id);
      expect(notReassigned.status).toBe('completed');
    });

    it('removes agent from TeamConfig.members', async () => {
      const agentId = `member-kill-${teamCounter}`;
      createTestAgent(testTeam, agentId);

      const configBefore = readValidatedJSON(getTeamConfigPath(testTeam), TeamConfigSchema);
      expect(configBefore.members.some((m) => m.agentId === agentId)).toBe(true);

      await AgentOperations.forceKill({ teamName: testTeam, agentId });

      const configAfter = readValidatedJSON(getTeamConfigPath(testTeam), TeamConfigSchema);
      expect(configAfter.members.some((m) => m.agentId === agentId)).toBe(false);
    });

    it('handles agent with no tasks', async () => {
      const agentId = `no-tasks-${teamCounter}`;
      createTestAgent(testTeam, agentId);

      const result = await AgentOperations.forceKill({ teamName: testTeam, agentId });
      expect(result.success).toBe(true);
      expect(result.reassignedTasks).toEqual([]);
    });
  });

  describe('requestGracefulShutdown', () => {
    it('returns error for non-existent agent', () => {
      const result = AgentOperations.requestGracefulShutdown({
        teamName: testTeam,
        requesterAgentId: 'leader-1',
        targetAgentId: 'nonexistent',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for already terminated agent', () => {
      const agentId = `grace-term-${teamCounter}`;
      const agent = createTestAgent(testTeam, agentId);
      AgentOperations.updateAgentState(agent.id, {
        status: 'terminated',
        isActive: false,
        terminatedAt: new Date().toISOString(),
      });

      const result = AgentOperations.requestGracefulShutdown({
        teamName: testTeam,
        requesterAgentId: 'leader-1',
        targetAgentId: agentId,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('already terminated');
    });

    it('returns error if agent already shutting down', () => {
      const agentId = `grace-shut-${teamCounter}`;
      const agent = createTestAgent(testTeam, agentId);
      AgentOperations.updateAgentState(agent.id, { status: 'shutting_down' });

      const result = AgentOperations.requestGracefulShutdown({
        teamName: testTeam,
        requesterAgentId: 'leader-1',
        targetAgentId: agentId,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('force=true');
    });

    it('delivers shutdown_request message and updates status', () => {
      const agentId = `grace-ok-${teamCounter}`;
      createTestAgent(testTeam, agentId);

      const result = AgentOperations.requestGracefulShutdown({
        teamName: testTeam,
        requesterAgentId: 'leader-1',
        targetAgentId: agentId,
        reason: 'task complete',
      });

      expect(result.success).toBe(true);
      expect(result.phase).toBe('requested');

      const updated = AgentOperations.getAgentState(agentId);
      expect(updated!.status).toBe('shutting_down');

      const inboxPath = getAgentInboxPath(testTeam, agentId);
      const inbox = readValidatedJSON(inboxPath, InboxSchema);
      const shutdownMsg = inbox.find((m) => m.type === 'shutdown_request');
      expect(shutdownMsg).toBeDefined();
      expect(shutdownMsg!.from).toBe('leader-1');
    });
  });
});

describe('TaskOperations - reassignAgentTasks', () => {
  let testTeam: string;
  let teamCounter = 100;

  beforeEach(() => {
    teamCounter++;
    testTeam = `reassign-team-${teamCounter}`;
    createTestTeam(testTeam);
  });

  it('reassigns in_progress tasks owned by agent to pending', () => {
    const agentId = `reassign-agent-${teamCounter}`;
    const task = TaskOperations.createTask(testTeam, { title: 'Test' });
    TaskOperations.claimTask(testTeam, task.id, agentId);

    const result = TaskOperations.reassignAgentTasks(testTeam, agentId);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(task.id);

    const updated = TaskOperations.getTask(testTeam, task.id);
    expect(updated.status).toBe('pending');
    expect(updated.owner).toBeUndefined();
    expect(updated.claimedAt).toBeUndefined();
  });

  it('sets warning message on reassigned tasks', () => {
    const agentId = `warn-agent-${teamCounter}`;
    const task = TaskOperations.createTask(testTeam, { title: 'Warn' });
    TaskOperations.claimTask(testTeam, task.id, agentId);

    TaskOperations.reassignAgentTasks(testTeam, agentId);

    const updated = TaskOperations.getTask(testTeam, task.id);
    expect(updated.warning).toContain(agentId);
    expect(updated.warning).toContain('Reassigned');
  });

  it('does NOT reassign completed tasks', () => {
    const agentId = `comp-agent-${teamCounter}`;
    const task = TaskOperations.createTask(testTeam, { title: 'Completed' });
    TaskOperations.claimTask(testTeam, task.id, agentId);
    TaskOperations.updateTask(testTeam, task.id, { status: 'completed' });

    const result = TaskOperations.reassignAgentTasks(testTeam, agentId);
    expect(result).toEqual([]);

    const unchanged = TaskOperations.getTask(testTeam, task.id);
    expect(unchanged.status).toBe('completed');
  });

  it('does NOT reassign tasks owned by other agents', () => {
    const agentA = `agentA-${teamCounter}`;
    const agentB = `agentB-${teamCounter}`;
    const taskA = TaskOperations.createTask(testTeam, { title: 'A' });
    const taskB = TaskOperations.createTask(testTeam, { title: 'B' });
    TaskOperations.claimTask(testTeam, taskA.id, agentA);
    TaskOperations.claimTask(testTeam, taskB.id, agentB);

    const result = TaskOperations.reassignAgentTasks(testTeam, agentA);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(taskA.id);

    const bTask = TaskOperations.getTask(testTeam, taskB.id);
    expect(bTask.status).toBe('in_progress');
    expect(bTask.owner).toBe(agentB);
  });

  it('returns empty array if no tasks to reassign', () => {
    const result = TaskOperations.reassignAgentTasks(testTeam, 'nobody');
    expect(result).toEqual([]);
  });

  it('returns empty array if team tasks directory does not exist', () => {
    const result = TaskOperations.reassignAgentTasks('nonexistent-team-xyz', 'nobody');
    expect(result).toEqual([]);
  });
});
