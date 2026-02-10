import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentOperations } from '../src/operations/agent';
import { EventBus } from '../src/operations/event-bus';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import type { DispatchEvent } from '../src/types/schemas';

describe('Event Emission', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'event-test-team';
  let events: DispatchEvent[] = [];

  beforeEach(() => {
    EventBus.clear();
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-events-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;

    // Create a team
    TeamOperations.spawnTeam(teamName, {
      agentId: 'leader-1',
      agentName: 'Leader',
      agentType: 'leader',
    });

    // Capture all events
    events = [];
    const eventTypes = [
      'task.created',
      'task.completed',
      'task.unblocked',
      'agent.idle',
      'agent.terminated',
      'session.idle'
    ] as const;

    for (const type of eventTypes) {
      EventBus.subscribe(type, (event) => {
        events.push(event);
      });
    }
  });

  afterEach(() => {
    EventBus.clear();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('Task Events', () => {
    it('emits task.created when creating a task', () => {
      const task = TaskOperations.createTask(teamName, {
        title: 'Test Task',
        priority: 'high',
      });

      const createdEvent = events.find((e) => e.type === 'task.created');
      expect(createdEvent).toBeDefined();
      expect(createdEvent?.teamName).toBe(teamName);
      expect(createdEvent?.payload).toEqual({
        taskId: task.id,
        title: 'Test Task',
        priority: 'high',
      });
    });

    it('emits task.completed when completing a task', () => {
      const task = TaskOperations.createTask(teamName, { title: 'To Complete' });
      TaskOperations.claimTask(teamName, task.id, 'worker-1');
      
      // clear created event
      events = [];

      TaskOperations.updateTask(teamName, task.id, { status: 'completed' });

      const completedEvent = events.find((e) => e.type === 'task.completed');
      expect(completedEvent).toBeDefined();
      expect(completedEvent?.payload).toEqual({
        taskId: task.id,
        title: 'To Complete',
      });
    });

    it('emits task.unblocked when dependency is completed', () => {
      const dep = TaskOperations.createTask(teamName, { title: 'Dependency' });
      const dependent = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [dep.id],
      });

      TaskOperations.claimTask(teamName, dep.id, 'worker-1');
      
      // clear events
      events = [];

      TaskOperations.updateTask(teamName, dep.id, { status: 'completed' });

      // Should have task.completed for dep
      const completedEvent = events.find((e) => e.type === 'task.completed' && e.payload.taskId === dep.id);
      expect(completedEvent).toBeDefined();

      // Should have task.unblocked for dependent
      const unblockedEvent = events.find((e) => e.type === 'task.unblocked' && e.payload.taskId === dependent.id);
      expect(unblockedEvent).toBeDefined();
      expect(unblockedEvent?.payload.title).toBe('Dependent');
    });

    it('does NOT emit task.unblocked if remaining dependencies exist', () => {
      const dep1 = TaskOperations.createTask(teamName, { title: 'Dep 1' });
      const dep2 = TaskOperations.createTask(teamName, { title: 'Dep 2' });
      const dependent = TaskOperations.createTask(teamName, {
        title: 'Dependent',
        dependencies: [dep1.id, dep2.id],
      });

      TaskOperations.claimTask(teamName, dep1.id, 'worker-1');
      
      events = [];
      TaskOperations.updateTask(teamName, dep1.id, { status: 'completed' });

      // Should NOT have task.unblocked yet
      const unblockedEvent = events.find((e) => e.type === 'task.unblocked');
      expect(unblockedEvent).toBeUndefined();

      // Now complete the second dependency
      TaskOperations.claimTask(teamName, dep2.id, 'worker-2');
      events = [];
      TaskOperations.updateTask(teamName, dep2.id, { status: 'completed' });

      // NOW it should emit
      const unblockedEvent2 = events.find((e) => e.type === 'task.unblocked');
      expect(unblockedEvent2).toBeDefined();
      expect(unblockedEvent2?.payload.taskId).toBe(dependent.id);
    });
  });

  describe('Agent Events', () => {
    it('emits agent.idle when heartbeat indicates idle transition', () => {
      // Need to register an agent first
      const agentId = 'test-agent-1';
      AgentOperations.registerAgent({
        id: agentId,
        name: 'Test Agent',
        teamName,
        role: 'worker',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        heartbeatTs: new Date().toISOString(),
        consecutiveMisses: 0,
        sessionRotationCount: 0,
        sessionId: 'sess-123',
        serverPort: 1234,
        cwd: process.cwd(),
        model: 'test-model',
        color: '#0000FF',
      });

      events = [];
      
      // Update heartbeat with sdk_session_idle source
      AgentOperations.updateHeartbeat(agentId, 'sdk_session_idle');

      const idleEvent = events.find((e) => e.type === 'agent.idle');
      expect(idleEvent).toBeDefined();
      expect(idleEvent?.payload).toEqual({
        agentId,
        agentName: 'Test Agent',
      });
    });

    it('emits agent.terminated on forceKill', async () => {
      const agentId = 'kill-me';
      AgentOperations.registerAgent({
        id: agentId,
        name: 'Doom Guy',
        teamName,
        role: 'worker',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        heartbeatTs: new Date().toISOString(),
        consecutiveMisses: 0,
        sessionRotationCount: 0,
        sessionId: 'sess-666',
        serverPort: 1234,
        cwd: process.cwd(),
        model: 'test-model',
        color: '#FF0000',
      });

      events = [];

      await AgentOperations.forceKill({
        teamName,
        agentId,
        reason: 'Test termination',
      });

      const termEvent = events.find((e) => e.type === 'agent.terminated');
      expect(termEvent).toBeDefined();
      expect(termEvent?.payload.agentId).toBe(agentId);
      expect(termEvent?.payload.reason).toContain('Test termination');
    });
  });
});
