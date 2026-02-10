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
});
