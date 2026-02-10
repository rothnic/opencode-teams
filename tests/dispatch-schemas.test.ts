import { describe, it, expect } from 'bun:test';
import {
  DispatchEventTypeSchema,
  DispatchEventSchema,
  DispatchConditionSchema,
  DispatchActionSchema,
  DispatchRuleSchema,
  DispatchLogEntrySchema,
  TeamConfigSchema
} from '../src/types/schemas';

describe('Dispatch Schemas', () => {
  describe('DispatchEventType', () => {
    it('should parse valid event types', () => {
      expect(DispatchEventTypeSchema.parse('task.created')).toBe('task.created');
      expect(DispatchEventTypeSchema.parse('agent.idle')).toBe('agent.idle');
    });

    it('should reject invalid event types', () => {
      expect(() => DispatchEventTypeSchema.parse('invalid.event')).toThrow();
    });
  });

  describe('DispatchEvent', () => {
    it('should parse valid event', () => {
      const event = {
        id: 'evt-123',
        type: 'task.created' as const,
        teamName: 'team-a',
        timestamp: new Date().toISOString(),
        payload: { taskId: 't-1' }
      };
      expect(DispatchEventSchema.parse(event)).toEqual(event);
    });

    it('should parse event with empty payload', () => {
      const event = {
        id: 'evt-123',
        type: 'task.created' as const,
        teamName: 'team-a',
        timestamp: new Date().toISOString(),
      };
      const parsed = DispatchEventSchema.parse(event);
      expect(parsed.payload).toEqual({});
    });

    it('should reject missing fields', () => {
      expect(() => DispatchEventSchema.parse({ type: 'task.created' })).toThrow();
    });
  });

  describe('DispatchCondition', () => {
    it('should parse simple_match condition', () => {
      const cond = {
        type: 'simple_match' as const,
        field: 'priority',
        operator: 'eq' as const,
        value: 'high'
      };
      expect(DispatchConditionSchema.parse(cond)).toEqual(cond);
    });

    it('should parse resource_count condition', () => {
      const cond = {
        type: 'resource_count' as const,
        resource: 'active_agents' as const,
        operator: 'gt' as const,
        value: 2
      };
      expect(DispatchConditionSchema.parse(cond)).toEqual(cond);
    });

    it('should reject invalid operator', () => {
      const cond = {
        type: 'simple_match',
        operator: 'invalid',
        value: 'high'
      };
      expect(() => DispatchConditionSchema.parse(cond)).toThrow();
    });
  });

  describe('DispatchAction', () => {
    it('should parse assign_task action', () => {
      const action = {
        type: 'assign_task' as const,
        params: { strategy: 'round_robin' }
      };
      expect(DispatchActionSchema.parse(action)).toEqual(action);
    });

    it('should reject invalid type', () => {
      expect(() => DispatchActionSchema.parse({ type: 'invalid' })).toThrow();
    });
  });

  describe('DispatchRule', () => {
    it('should parse minimal rule', () => {
      const rule = {
        id: 'rule-1',
        eventType: 'task.created' as const,
        action: { type: 'log' as const }
      };
      const parsed = DispatchRuleSchema.parse(rule);
      expect(parsed).toEqual({
        ...rule,
        priority: 0,
        enabled: true
      });
    });

    it('should parse full rule', () => {
      const rule = {
        id: 'rule-1',
        eventType: 'task.created' as const,
        condition: { type: 'simple_match' as const, operator: 'eq' as const, value: true },
        action: { type: 'log' as const },
        priority: 10,
        enabled: false
      };
      expect(DispatchRuleSchema.parse(rule)).toEqual(rule);
    });
  });

  describe('DispatchLogEntry', () => {
    it('should parse valid log entry', () => {
      const entry = {
        id: 'log-1',
        timestamp: new Date().toISOString(),
        ruleId: 'rule-1',
        eventType: 'task.created' as const,
        success: true,
        details: 'executed'
      };
      expect(DispatchLogEntrySchema.parse(entry)).toEqual(entry);
    });
  });

  describe('TeamConfig Integration', () => {
    it('should parse config with dispatch fields', () => {
      const config = {
        name: 'team-dispatch',
        created: new Date().toISOString(),
        leader: 'leader-1',
        members: [{ agentId: 'a1', agentName: 'A1', agentType: 'worker', joinedAt: new Date().toISOString() }],
        dispatchRules: [{
          id: 'r1',
          eventType: 'task.created' as const,
          action: { type: 'log' as const },
          priority: 0,
          enabled: true
        }],
        dispatchLog: []
      };
      expect(TeamConfigSchema.parse(config)).toEqual(config);
    });

    it('should be backward compatible (no dispatch fields)', () => {
      const config = {
        name: 'team-legacy',
        created: new Date().toISOString(),
        leader: 'leader-1',
        members: [{ agentId: 'a1', agentName: 'A1', agentType: 'worker', joinedAt: new Date().toISOString() }]
      };
      const parsed = TeamConfigSchema.parse(config);
      expect(parsed.dispatchRules).toEqual([]);
      expect(parsed.dispatchLog).toEqual([]);
    });
  });
});
