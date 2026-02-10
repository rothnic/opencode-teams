import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import {
  AgentStateSchema,
  RoleDefinitionSchema,
  TeamConfigSchema,
  TeamTemplateSchema,
  TopologyTypeSchema,
  WorkflowConfigSchema,
} from '../src/types/schemas';
import { getProjectTemplatesDir, getTemplatePath } from '../src/utils/storage-paths';

describe('Schema Extensions', () => {
  describe('TopologyType', () => {
    it('accepts valid values', () => {
      expect(TopologyTypeSchema.parse('flat')).toBe('flat');
      expect(TopologyTypeSchema.parse('hierarchical')).toBe('hierarchical');
    });

    it('rejects invalid values', () => {
      expect(() => TopologyTypeSchema.parse('matrix')).toThrow();
    });
  });

  describe('RoleDefinition', () => {
    it('accepts minimal role', () => {
      const role = { name: 'worker' };
      const parsed = RoleDefinitionSchema.parse(role);
      expect(parsed.name).toBe('worker');
    });

    it('accepts full role definition', () => {
      const role = {
        name: 'specialist',
        allowedTools: ['tool-a'],
        deniedTools: ['tool-b'],
        description: 'A specialist role',
      };
      const parsed = RoleDefinitionSchema.parse(role);
      expect(parsed.name).toBe('specialist');
      expect(parsed.allowedTools).toEqual(['tool-a']);
    });

    it('rejects empty name', () => {
      expect(() => RoleDefinitionSchema.parse({ name: '' })).toThrow();
    });
  });

  describe('WorkflowConfig', () => {
    it('applies defaults for empty object', () => {
      const config = WorkflowConfigSchema.parse({});
      expect(config.enabled).toBe(false);
      expect(config.taskThreshold).toBe(5);
      expect(config.workerRatio).toBe(3.0);
      expect(config.cooldownSeconds).toBe(300);
    });

    it('accepts custom values', () => {
      const config = WorkflowConfigSchema.parse({
        enabled: true,
        taskThreshold: 10,
      });
      expect(config.enabled).toBe(true);
      expect(config.taskThreshold).toBe(10);
      expect(config.cooldownSeconds).toBe(300);
    });

    it('rejects negative values', () => {
      expect(() => WorkflowConfigSchema.parse({ taskThreshold: -1 })).toThrow();
      expect(() => WorkflowConfigSchema.parse({ cooldownSeconds: -1 })).toThrow();
    });
  });

  describe('TeamTemplate', () => {
    const validRole = { name: 'worker' };

    it('accepts valid template', () => {
      const template = {
        name: 'standard-team',
        roles: [validRole],
        createdAt: '2023-01-01T00:00:00Z',
      };
      const parsed = TeamTemplateSchema.parse(template);
      expect(parsed.name).toBe('standard-team');
      expect(parsed.topology).toBe('flat');
    });

    it('rejects invalid name format', () => {
      expect(() =>
        TeamTemplateSchema.parse({
          name: 'Bad Name',
          roles: [validRole],
          createdAt: '2023-01-01T00:00:00Z',
        }),
      ).toThrow();
    });

    it('rejects empty roles array', () => {
      expect(() =>
        TeamTemplateSchema.parse({
          name: 'empty-team',
          roles: [],
          createdAt: '2023-01-01T00:00:00Z',
        }),
      ).toThrow();
    });
  });

  describe('TeamConfig Extensions', () => {
    const baseConfig = {
      name: 'my-team',
      created: '2023-01-01T00:00:00Z',
      leader: 'agent-1',
      members: [
        {
          agentId: 'agent-1',
          agentName: 'Leader',
          agentType: 'leader',
          joinedAt: '2023-01-01T00:00:00Z',
        },
      ],
    };

    it('maintains backward compatibility (no new fields)', () => {
      const parsed = TeamConfigSchema.parse(baseConfig);
      expect(parsed.name).toBe('my-team');
      expect(parsed.topology).toBeUndefined();
    });

    it('accepts new optional fields', () => {
      const extendedConfig = {
        ...baseConfig,
        topology: 'hierarchical',
        description: 'A test team',
        templateSource: 'custom-template',
        roles: [{ name: 'worker' }],
        workflowConfig: { enabled: true },
      };
      // @ts-ignore - explicitly testing runtime parsing of extended object
      const parsed = TeamConfigSchema.parse(extendedConfig);

      expect(parsed.topology).toBe('hierarchical');
      expect(parsed.description).toBe('A test team');
      expect(parsed.roles).toHaveLength(1);
      expect(parsed.workflowConfig?.enabled).toBe(true);
    });
  });

  describe('AgentState Role Extension', () => {
    const getBaseState = () => ({
      id: 'agent-1',
      name: 'Agent',
      teamName: 'team-1',
      model: 'gpt-4',
      sessionId: 'sess-1',
      serverPort: 3000,
      cwd: '/tmp',
      color: '#000000',
      status: 'active',
      isActive: true,
      createdAt: '2023-01-01T00:00:00Z',
      heartbeatTs: '2023-01-01T00:00:00Z',
    });

    it('accepts new task-manager role', () => {
      const state = { ...getBaseState(), role: 'task-manager' };
      const parsed = AgentStateSchema.parse(state);
      expect(parsed.role).toBe('task-manager');
    });

    it('defaults to worker', () => {
      const state = { ...getBaseState(), role: undefined };
      const parsed = AgentStateSchema.parse(state);
      expect(parsed.role).toBe('worker');
    });
  });

  describe('Storage Paths', () => {
    it('getProjectTemplatesDir returns correct path', () => {
      const root = '/tmp/project';
      const dir = getProjectTemplatesDir(root);
      expect(dir).toBe(join(root, '.opencode/opencode-teams/templates'));
    });

    it('getTemplatePath returns correct file path', () => {
      const root = '/tmp/project';
      const path = getTemplatePath('my-template', root);
      expect(path).toBe(join(root, '.opencode/opencode-teams/templates/my-template.json'));
    });
  });
});
