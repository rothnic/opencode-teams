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
  tmpDir = mkdtempSync(join(tmpdir(), 'agent-heartbeat-test-'));
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

describe('AgentOperations - updateHeartbeat', () => {
  let testTeam: string;
  let teamCounter = 0;

  beforeEach(() => {
    teamCounter++;
    testTeam = `hb-team-${teamCounter}`;
    createTestTeam(testTeam);
  });

  it('returns error for non-existent agent', () => {
    const result = AgentOperations.updateHeartbeat('nonexistent', 'tool');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error for terminated agent', () => {
    const agentId = `terminated-hb-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'terminated', isActive: false });

    const result = AgentOperations.updateHeartbeat(agentId, 'tool');
    expect(result.success).toBe(false);
    expect(result.agentStatus).toBe('terminated');
    expect(result.error).toContain('Cannot heartbeat');
  });

  it('returns error for inactive agent', () => {
    const agentId = `inactive-hb-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'inactive', isActive: false });

    const result = AgentOperations.updateHeartbeat(agentId, 'tool');
    expect(result.success).toBe(false);
    expect(result.agentStatus).toBe('inactive');
    expect(result.error).toContain('Cannot heartbeat');
  });

  it('successfully updates heartbeat timestamp for active agent', () => {
    const agentId = `active-hb-${teamCounter}`;
    const oldTs = new Date(Date.now() - 10_000).toISOString();
    createTestAgent(testTeam, agentId, { heartbeatTs: oldTs });

    const result = AgentOperations.updateHeartbeat(agentId, 'tool');
    expect(result.success).toBe(true);
    expect(result.heartbeatTs).toBeDefined();
    expect(new Date(result.heartbeatTs).getTime()).toBeGreaterThan(new Date(oldTs).getTime());
  });

  it('resets consecutiveMisses to 0 on successful heartbeat', () => {
    const agentId = `misses-hb-${teamCounter}`;
    createTestAgent(testTeam, agentId, { consecutiveMisses: 3 });

    AgentOperations.updateHeartbeat(agentId, 'tool');

    const updated = AgentOperations.getAgentState(agentId);
    expect(updated!.consecutiveMisses).toBe(0);
  });

  it('returns nextDeadline approximately 60s in the future', () => {
    const agentId = `deadline-hb-${teamCounter}`;
    createTestAgent(testTeam, agentId);

    const result = AgentOperations.updateHeartbeat(agentId, 'tool');
    const hbTime = new Date(result.heartbeatTs).getTime();
    const deadlineTime = new Date(result.nextDeadline).getTime();
    const diff = deadlineTime - hbTime;

    expect(diff).toBeGreaterThanOrEqual(59_000);
    expect(diff).toBeLessThanOrEqual(61_000);
  });

  it('source sdk_session_idle transitions active -> idle', () => {
    const agentId = `idle-trans-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'active' });

    const result = AgentOperations.updateHeartbeat(agentId, 'sdk_session_idle');
    expect(result.agentStatus).toBe('idle');

    const updated = AgentOperations.getAgentState(agentId);
    expect(updated!.status).toBe('idle');
  });

  it('source sdk_session_updated transitions idle -> active', () => {
    const agentId = `updated-trans-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'idle' });

    const result = AgentOperations.updateHeartbeat(agentId, 'sdk_session_updated');
    expect(result.agentStatus).toBe('active');
  });

  it('source sdk_tool_execute transitions idle -> active', () => {
    const agentId = `tool-trans-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'idle' });

    const result = AgentOperations.updateHeartbeat(agentId, 'sdk_tool_execute');
    expect(result.agentStatus).toBe('active');
  });

  it('source tool transitions spawning -> active', () => {
    const agentId = `spawn-trans-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'spawning' });

    const result = AgentOperations.updateHeartbeat(agentId, 'tool');
    expect(result.agentStatus).toBe('active');
  });

  it('source tool does NOT transition already-active agent', () => {
    const agentId = `noop-trans-${teamCounter}`;
    createTestAgent(testTeam, agentId, { status: 'active' });

    const result = AgentOperations.updateHeartbeat(agentId, 'tool');
    expect(result.agentStatus).toBe('active');
  });
});

describe('AgentOperations - sweepStaleAgents', () => {
  let testTeam: string;
  let teamCounter = 200;

  beforeEach(() => {
    teamCounter++;
    testTeam = `sweep-team-${teamCounter}`;
    createTestTeam(testTeam);
  });

  it('returns empty array when no agents are stale', () => {
    const agentId = `fresh-${teamCounter}`;
    createTestAgent(testTeam, agentId, { heartbeatTs: new Date().toISOString() });

    const stale = AgentOperations.sweepStaleAgents();
    expect(stale).toEqual([]);
  });

  it('increments consecutiveMisses but does not mark inactive if misses < 2', () => {
    const agentId = `miss1-${teamCounter}`;
    const staleTs = new Date(Date.now() - 120_000).toISOString();
    createTestAgent(testTeam, agentId, { heartbeatTs: staleTs, consecutiveMisses: 0 });

    const stale = AgentOperations.sweepStaleAgents();
    expect(stale).toEqual([]);

    const updated = AgentOperations.getAgentState(agentId);
    expect(updated!.consecutiveMisses).toBe(1);
    expect(updated!.status).toBe('active');
  });

  it('marks agent inactive when consecutiveMisses reaches 2', () => {
    const agentId = `miss2-${teamCounter}`;
    const staleTs = new Date(Date.now() - 120_000).toISOString();
    createTestAgent(testTeam, agentId, { heartbeatTs: staleTs, consecutiveMisses: 1 });

    const stale = AgentOperations.sweepStaleAgents();
    expect(stale).toContain(agentId);

    const updated = AgentOperations.getAgentState(agentId);
    expect(updated!.status).toBe('inactive');
    expect(updated!.isActive).toBe(false);
    expect(updated!.consecutiveMisses).toBe(2);
  });

  it('reassigns tasks when agent is marked inactive', () => {
    const agentId = `reassign-${teamCounter}`;
    const staleTs = new Date(Date.now() - 120_000).toISOString();
    createTestAgent(testTeam, agentId, { heartbeatTs: staleTs, consecutiveMisses: 1 });

    const task = TaskOperations.createTask(testTeam, { title: 'Reassign me' });
    TaskOperations.claimTask(testTeam, task.id, agentId);

    AgentOperations.sweepStaleAgents();

    const updated = TaskOperations.getTask(testTeam, task.id);
    expect(updated.status).toBe('pending');
    expect(updated.owner).toBeUndefined();
  });

  it('skips agents with heartbeat within 60s', () => {
    const agentId = `recent-${teamCounter}`;
    const recentTs = new Date(Date.now() - 30_000).toISOString();
    createTestAgent(testTeam, agentId, { heartbeatTs: recentTs });

    const stale = AgentOperations.sweepStaleAgents();
    expect(stale).toEqual([]);

    const updated = AgentOperations.getAgentState(agentId);
    expect(updated!.consecutiveMisses).toBe(0);
  });

  it('skips agents that are already inactive', () => {
    const agentId = `already-inactive-${teamCounter}`;
    const staleTs = new Date(Date.now() - 120_000).toISOString();
    createTestAgent(testTeam, agentId, {
      heartbeatTs: staleTs,
      status: 'inactive',
      isActive: false,
    });

    const stale = AgentOperations.sweepStaleAgents();
    expect(stale).toEqual([]);
  });
});

describe('AgentOperations - startStaleSweep', () => {
  it('returns an interval timer', () => {
    const timer = AgentOperations.startStaleSweep(60_000);
    expect(timer).toBeDefined();
    clearInterval(timer);
  });
});
