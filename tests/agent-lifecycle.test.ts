import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentOperations } from '../src/operations/agent';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import type { AgentState } from '../src/types/schemas';
import { allocateColor } from '../src/utils/color-pool';

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-lifecycle-test-'));
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

describe('Agent Lifecycle Integration', () => {
  let testTeam: string;
  let teamCounter = 0;

  beforeEach(() => {
    teamCounter++;
    testTeam = `lifecycle-team-${teamCounter}`;
    createTestTeam(testTeam);
  });

  describe('spawn -> heartbeat -> idle -> active cycle', () => {
    it('transitions through spawning -> active -> idle -> active via heartbeats', () => {
      const agentId = `cycle-${teamCounter}`;
      createTestAgent(testTeam, agentId, { status: 'spawning' });

      const spawn = AgentOperations.getAgentState(agentId);
      expect(spawn!.status).toBe('spawning');

      const hb1 = AgentOperations.updateHeartbeat(agentId, 'tool');
      expect(hb1.agentStatus).toBe('active');

      const hb2 = AgentOperations.updateHeartbeat(agentId, 'sdk_session_idle');
      expect(hb2.agentStatus).toBe('idle');

      const hb3 = AgentOperations.updateHeartbeat(agentId, 'sdk_session_updated');
      expect(hb3.agentStatus).toBe('active');
    });
  });

  describe('spawn -> work tasks -> kill -> task reassignment', () => {
    it('full workflow: agent claims tasks, gets killed, tasks return to pending', async () => {
      const agentId = `work-kill-${teamCounter}`;
      createTestAgent(testTeam, agentId);

      const task1 = TaskOperations.createTask(testTeam, { title: 'Task A' });
      const task2 = TaskOperations.createTask(testTeam, { title: 'Task B' });
      const task3 = TaskOperations.createTask(testTeam, { title: 'Task C' });

      TaskOperations.claimTask(testTeam, task1.id, agentId);
      TaskOperations.claimTask(testTeam, task2.id, agentId);
      TaskOperations.claimTask(testTeam, task3.id, agentId);
      TaskOperations.updateTask(testTeam, task3.id, { status: 'completed' });

      const result = await AgentOperations.forceKill({
        teamName: testTeam,
        agentId,
        reason: 'integration test',
      });

      expect(result.success).toBe(true);
      expect(result.reassignedTasks).toHaveLength(2);
      expect(result.reassignedTasks).toContain(task1.id);
      expect(result.reassignedTasks).toContain(task2.id);

      expect(TaskOperations.getTask(testTeam, task1.id).status).toBe('pending');
      expect(TaskOperations.getTask(testTeam, task2.id).status).toBe('pending');
      expect(TaskOperations.getTask(testTeam, task3.id).status).toBe('completed');

      const agent = AgentOperations.getAgentState(agentId);
      expect(agent!.status).toBe('terminated');
      expect(agent!.isActive).toBe(false);
    });
  });

  describe('heartbeat timeout -> stale sweep -> recovery', () => {
    it('agent goes stale, sweep marks inactive, tasks reassigned, new agent claims', () => {
      const staleAgentId = `stale-${teamCounter}`;
      const freshAgentId = `fresh-${teamCounter}`;
      const staleTs = new Date(Date.now() - 120_000).toISOString();

      createTestAgent(testTeam, staleAgentId, {
        heartbeatTs: staleTs,
        consecutiveMisses: 1,
      });

      const task = TaskOperations.createTask(testTeam, { title: 'Recover me' });
      TaskOperations.claimTask(testTeam, task.id, staleAgentId);

      const staleIds = AgentOperations.sweepStaleAgents();
      expect(staleIds).toContain(staleAgentId);

      const staleAgent = AgentOperations.getAgentState(staleAgentId);
      expect(staleAgent!.status).toBe('inactive');

      const reassignedTask = TaskOperations.getTask(testTeam, task.id);
      expect(reassignedTask.status).toBe('pending');
      expect(reassignedTask.owner).toBeUndefined();

      createTestAgent(testTeam, freshAgentId);
      const claimed = TaskOperations.claimTask(testTeam, task.id, freshAgentId);
      expect(claimed.status).toBe('in_progress');
      expect(claimed.owner).toBe(freshAgentId);
    });
  });

  describe('graceful shutdown -> force kill fallback', () => {
    it('graceful shutdown sets shutting_down, force kill terminates', async () => {
      const agentId = `graceful-${teamCounter}`;
      createTestAgent(testTeam, agentId);

      const graceful = AgentOperations.requestGracefulShutdown({
        teamName: testTeam,
        requesterAgentId: 'leader-1',
        targetAgentId: agentId,
        reason: 'work complete',
      });
      expect(graceful.success).toBe(true);
      expect(graceful.phase).toBe('requested');

      const shuttingDown = AgentOperations.getAgentState(agentId);
      expect(shuttingDown!.status).toBe('shutting_down');

      const forceResult = await AgentOperations.forceKill({
        teamName: testTeam,
        agentId,
        reason: 'timeout on graceful',
      });
      expect(forceResult.success).toBe(true);

      const terminated = AgentOperations.getAgentState(agentId);
      expect(terminated!.status).toBe('terminated');
    });
  });

  describe('multi-agent team coordination', () => {
    it('multiple agents work independently, one killed without affecting others', async () => {
      const agent1 = `multi-1-${teamCounter}`;
      const agent2 = `multi-2-${teamCounter}`;
      const agent3 = `multi-3-${teamCounter}`;

      createTestAgent(testTeam, agent1);
      createTestAgent(testTeam, agent2);
      createTestAgent(testTeam, agent3);

      const tasks = [
        TaskOperations.createTask(testTeam, { title: 'T1' }),
        TaskOperations.createTask(testTeam, { title: 'T2' }),
        TaskOperations.createTask(testTeam, { title: 'T3' }),
      ];

      TaskOperations.claimTask(testTeam, tasks[0].id, agent1);
      TaskOperations.claimTask(testTeam, tasks[1].id, agent2);
      TaskOperations.claimTask(testTeam, tasks[2].id, agent3);

      await AgentOperations.forceKill({ teamName: testTeam, agentId: agent2 });

      expect(TaskOperations.getTask(testTeam, tasks[0].id).owner).toBe(agent1);
      expect(TaskOperations.getTask(testTeam, tasks[0].id).status).toBe('in_progress');

      expect(TaskOperations.getTask(testTeam, tasks[1].id).status).toBe('pending');
      expect(TaskOperations.getTask(testTeam, tasks[1].id).owner).toBeUndefined();

      expect(TaskOperations.getTask(testTeam, tasks[2].id).owner).toBe(agent3);
      expect(TaskOperations.getTask(testTeam, tasks[2].id).status).toBe('in_progress');

      const agent2State = AgentOperations.getAgentState(agent2);
      expect(agent2State!.status).toBe('terminated');

      AgentOperations.updateHeartbeat(agent1, 'tool');
      AgentOperations.updateHeartbeat(agent3, 'tool');

      const agent1State = AgentOperations.getAgentState(agent1);
      const agent3State = AgentOperations.getAgentState(agent3);
      expect(agent1State!.status).toBe('active');
      expect(agent3State!.status).toBe('active');
    });
  });

  describe('consecutive miss threshold behavior', () => {
    it('requires exactly 2 consecutive misses before marking inactive', () => {
      const agentId = `threshold-${teamCounter}`;
      const staleTs = new Date(Date.now() - 120_000).toISOString();
      createTestAgent(testTeam, agentId, { heartbeatTs: staleTs, consecutiveMisses: 0 });

      AgentOperations.sweepStaleAgents();
      let agent = AgentOperations.getAgentState(agentId)!;
      expect(agent.status).toBe('active');
      expect(agent.consecutiveMisses).toBe(1);

      AgentOperations.sweepStaleAgents();
      agent = AgentOperations.getAgentState(agentId)!;
      expect(agent.status).toBe('inactive');
      expect(agent.consecutiveMisses).toBe(2);
    });

    it('heartbeat resets miss counter, preventing inactive transition', () => {
      const agentId = `reset-${teamCounter}`;
      const staleTs = new Date(Date.now() - 120_000).toISOString();
      createTestAgent(testTeam, agentId, { heartbeatTs: staleTs, consecutiveMisses: 0 });

      AgentOperations.sweepStaleAgents();
      expect(AgentOperations.getAgentState(agentId)!.consecutiveMisses).toBe(1);

      AgentOperations.updateHeartbeat(agentId, 'tool');
      expect(AgentOperations.getAgentState(agentId)!.consecutiveMisses).toBe(0);

      AgentOperations.updateAgentState(agentId, {
        heartbeatTs: new Date(Date.now() - 120_000).toISOString(),
      });
      AgentOperations.sweepStaleAgents();

      const agent = AgentOperations.getAgentState(agentId)!;
      expect(agent.status).toBe('active');
      expect(agent.consecutiveMisses).toBe(1);
    });
  });
});
