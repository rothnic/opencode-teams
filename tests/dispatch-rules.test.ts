/**
 * Tests for Dispatch Rule Operations and Event-Driven Dispatch
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DispatchRuleOperations } from '../src/operations/dispatch-rules';
import { TeamOperations } from '../src/operations/team';
import { TaskOperations } from '../src/operations/task';
import { AgentOperations } from '../src/operations/agent';
import { EventBus } from '../src/operations/event-bus';
import { initDispatchEngine } from '../src/operations/dispatch-engine';
import type { DispatchRule } from '../src/types/schemas';

describe('DispatchRuleOperations', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};
  const teamName = 'dispatch-test-team';

  beforeEach(() => {
    savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
    tempDir = mkdtempSync(join(tmpdir(), 'opencode-dispatch-test-'));
    process.env.OPENCODE_TEAMS_DIR = tempDir;

    EventBus.clear();
    initDispatchEngine();

    TeamOperations.spawnTeam(teamName, {
      agentId: 'leader-1',
      agentName: 'Leader',
      agentType: 'leader',
    });
  });

  afterEach(() => {
    EventBus.clear();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    process.env.OPENCODE_TEAMS_DIR = savedEnv.OPENCODE_TEAMS_DIR;
  });

  describe('CRUD Operations', () => {
    const rule: DispatchRule = {
      id: 'rule-1',
      eventType: 'task.created',
      condition: {
        type: 'simple_match',
        field: 'priority',
        operator: 'eq',
        value: 'high',
      },
      action: {
        type: 'notify_leader',
      },
      priority: 10,
      enabled: true,
    };

    it('adds a dispatch rule', () => {
      DispatchRuleOperations.addDispatchRule(teamName, rule);
      const rules = DispatchRuleOperations.listDispatchRules(teamName);
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('rule-1');
    });

    it('throws when adding duplicate rule ID', () => {
      DispatchRuleOperations.addDispatchRule(teamName, rule);
      expect(() => {
        DispatchRuleOperations.addDispatchRule(teamName, rule);
      }).toThrow('already exists');
    });

    it('removes a dispatch rule', () => {
      DispatchRuleOperations.addDispatchRule(teamName, rule);
      DispatchRuleOperations.removeDispatchRule(teamName, 'rule-1');
      const rules = DispatchRuleOperations.listDispatchRules(teamName);
      expect(rules).toHaveLength(0);
    });

    it('throws when removing non-existent rule', () => {
      expect(() => {
        DispatchRuleOperations.removeDispatchRule(teamName, 'non-existent');
      }).toThrow('not found');
    });

    it('lists rules', () => {
      DispatchRuleOperations.addDispatchRule(teamName, { ...rule, id: 'rule-1' });
      DispatchRuleOperations.addDispatchRule(teamName, { ...rule, id: 'rule-2' });
      const rules = DispatchRuleOperations.listDispatchRules(teamName);
      expect(rules).toHaveLength(2);
    });
  });

  describe('Integration: Event Triggering', () => {
    it('triggers action when event matches rule', async () => {
      const rule: DispatchRule = {
        id: 'auto-assign',
        eventType: 'task.created',
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'high',
        },
        action: {
          type: 'log',
          params: { message: 'High priority task detected' }
        },
        priority: 10,
        enabled: true,
      };

      DispatchRuleOperations.addDispatchRule(teamName, rule);

      TaskOperations.createTask(teamName, {
        title: 'Urgent Task',
        priority: 'high'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const logs = DispatchRuleOperations.getDispatchLog(teamName);
      expect(logs).toHaveLength(1);
      expect(logs[0].ruleId).toBe('auto-assign');
      expect(logs[0].success).toBe(true);
      expect(logs[0].eventType).toBe('task.created');
    });

    it('does not trigger action when condition fails', async () => {
      const rule: DispatchRule = {
        id: 'auto-assign',
        eventType: 'task.created',
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'high',
        },
        action: {
          type: 'log',
          params: { message: 'High priority task detected' }
        },
        priority: 10,
        enabled: true,
      };

      DispatchRuleOperations.addDispatchRule(teamName, rule);

      TaskOperations.createTask(teamName, {
        title: 'Normal Task',
        priority: 'normal'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const logs = DispatchRuleOperations.getDispatchLog(teamName);
      expect(logs).toHaveLength(0);
    });
  });

  describe('E2E Integration', () => {
    it('should auto-assign unblocked task to idle agent via dispatch rule', async () => {
      const task = TaskOperations.createTask(teamName, {
        title: 'Pending Task',
        priority: 'high',
      });

      const workerId = 'worker-1';
      AgentOperations.registerAgent({
        id: workerId,
        name: 'Worker',
        teamName,
        role: 'worker',
        model: 'test-model',
        sessionId: 'session-worker-1',
        serverPort: 3000,
        cwd: '/tmp',
        color: '#0000FF',
        status: 'idle',
        isActive: true,
        createdAt: new Date().toISOString(),
        heartbeatTs: new Date().toISOString(),
        consecutiveMisses: 0,
        sessionRotationCount: 0,
      });

      const rule: DispatchRule = {
        id: 'auto-assign-rule',
        eventType: 'task.created',
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'high',
        },
        action: {
          type: 'assign_task'
        },
        priority: 10,
        enabled: true,
      };
      DispatchRuleOperations.addDispatchRule(teamName, rule);

      TaskOperations.createTask(teamName, {
        title: 'Trigger Task',
        priority: 'high',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const tasks = TaskOperations.getTasks(teamName, { status: 'in_progress' });
      const assigned = tasks.find(t => t.owner === workerId);
      expect(assigned).toBeDefined();
      expect(assigned?.status).toBe('in_progress');
      
      const logs = DispatchRuleOperations.getDispatchLog(teamName);
      expect(logs.some(l => l.ruleId === 'auto-assign-rule' && l.success)).toBe(true);
    });

    it('should notify leader when agent terminates', async () => {
      const rule: DispatchRule = {
        id: 'notify-term',
        eventType: 'agent.terminated',
        condition: {
          type: 'simple_match',
          field: 'reason',
          operator: 'eq',
          value: 'test',
        },
        action: {
          type: 'notify_leader'
        },
        priority: 10,
        enabled: true,
      };
      DispatchRuleOperations.addDispatchRule(teamName, rule);

      const workerId = 'worker-term';
      AgentOperations.registerAgent({
        id: workerId,
        name: 'Worker Term',
        teamName,
        role: 'worker',
        model: 'test-model',
        sessionId: 'session-worker-term',
        serverPort: 3001,
        cwd: '/tmp',
        color: '#00FF00',
        status: 'idle',
        isActive: true,
        createdAt: new Date().toISOString(),
        heartbeatTs: new Date().toISOString(),
        consecutiveMisses: 0,
        sessionRotationCount: 0,
      });

      await AgentOperations.forceKill({ teamName, agentId: workerId, reason: 'test' });
      
      await new Promise(resolve => setTimeout(resolve, 100));

      const logs = DispatchRuleOperations.getDispatchLog(teamName);
      expect(logs.some(l => l.ruleId === 'notify-term' && l.success)).toBe(true);

      const messages = TeamOperations.readMessages(teamName, 'leader-1');
      const termMsg = messages.find(m => m.from === 'dispatch-engine' && m.message.includes('terminated'));
      expect(termMsg).toBeDefined();
    });

    it('should respect disabled rules', async () => {
      const rule: DispatchRule = {
        id: 'disabled-rule',
        eventType: 'task.created',
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'low',
        },
        action: {
          type: 'log',
          params: { message: 'Fail' }
        },
        priority: 10,
        enabled: false,
      };
      DispatchRuleOperations.addDispatchRule(teamName, rule);

      TaskOperations.createTask(teamName, {
        title: 'Low Task',
        priority: 'low',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const logs = DispatchRuleOperations.getDispatchLog(teamName);
      expect(logs.find(l => l.ruleId === 'disabled-rule')).toBeUndefined();
    });

    it('should handle multiple rules in priority order', async () => {
      const rule1: DispatchRule = {
        id: 'prio-1',
        eventType: 'task.created',
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'normal',
        },
        action: {
          type: 'log',
          params: { message: 'First' }
        },
        priority: 1,
        enabled: true,
      };
      const rule2: DispatchRule = {
        id: 'prio-2',
        eventType: 'task.created',
        condition: {
          type: 'simple_match',
          field: 'priority',
          operator: 'eq',
          value: 'normal',
        },
        action: {
          type: 'log',
          params: { message: 'Second' }
        },
        priority: 10,
        enabled: true,
      };

      DispatchRuleOperations.addDispatchRule(teamName, rule1);
      DispatchRuleOperations.addDispatchRule(teamName, rule2);

      TaskOperations.createTask(teamName, {
        title: 'Medium Task',
        priority: 'normal',
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const logs = DispatchRuleOperations.getDispatchLog(teamName)
        .filter(l => l.ruleId === 'prio-1' || l.ruleId === 'prio-2');
      
      expect(logs).toHaveLength(2);
      expect(logs[0].ruleId).toBe('prio-2');
      expect(logs[1].ruleId).toBe('prio-1');
    });
  });
});
