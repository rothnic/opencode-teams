import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getBuiltinTemplates, TemplateOperations } from '../src/operations/template';
import { TeamTemplateSchema } from '../src/types/schemas';

let testDir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'opencode-teams-template-'));
  savedEnv.OPENCODE_PROJECT_ROOT = process.env.OPENCODE_PROJECT_ROOT;
  savedEnv.OPENCODE_TEAMS_GLOBAL_DIR = process.env.OPENCODE_TEAMS_GLOBAL_DIR;
  savedEnv.OPENCODE_TEAMS_DIR = process.env.OPENCODE_TEAMS_DIR;
  process.env.OPENCODE_PROJECT_ROOT = testDir;
  process.env.OPENCODE_TEAMS_GLOBAL_DIR = join(testDir, 'global-config');
  delete process.env.OPENCODE_TEAMS_DIR;
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  process.env.OPENCODE_PROJECT_ROOT = savedEnv.OPENCODE_PROJECT_ROOT;
  process.env.OPENCODE_TEAMS_GLOBAL_DIR = savedEnv.OPENCODE_TEAMS_GLOBAL_DIR;
  if (savedEnv.OPENCODE_TEAMS_DIR === undefined) {
    delete process.env.OPENCODE_TEAMS_DIR;
  } else {
    process.env.OPENCODE_TEAMS_DIR = savedEnv.OPENCODE_TEAMS_DIR;
  }
});

function validTemplate(overrides: Record<string, unknown> = {}) {
  return {
    name: 'test-template',
    description: 'A test template',
    topology: 'flat' as const,
    roles: [{ name: 'worker' }],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TemplateOperations', () => {
  describe('save', () => {
    it('should save a valid template', () => {
      const template = validTemplate();
      const result = TemplateOperations.save(template);
      expect(result.name).toBe('test-template');
      expect(result.topology).toBe('flat');
    });

    it('should overwrite existing template (upsert)', () => {
      TemplateOperations.save(validTemplate());
      const updated = TemplateOperations.save(
        validTemplate({ description: 'Updated description' }),
      );
      expect(updated.description).toBe('Updated description');
    });

    it('should reject invalid template (missing roles)', () => {
      expect(() =>
        TemplateOperations.save({
          name: 'bad-template',
          roles: [],
          createdAt: new Date().toISOString(),
        } as never),
      ).toThrow();
    });

    it('should reject invalid name (not kebab-case)', () => {
      expect(() => TemplateOperations.save(validTemplate({ name: 'Bad Name' }))).toThrow();
    });
  });

  describe('load', () => {
    it('should load from project-local directory', () => {
      TemplateOperations.save(validTemplate());
      const loaded = TemplateOperations.load('test-template');
      expect(loaded.name).toBe('test-template');
    });

    it('should fall back to global templates', () => {
      const globalDir = join(testDir, 'global-config', 'templates');
      mkdirSync(globalDir, { recursive: true });
      const template = validTemplate({ name: 'global-tmpl' });
      const validated = TeamTemplateSchema.parse(template);
      writeFileSync(join(globalDir, 'global-tmpl.json'), JSON.stringify(validated, null, 2));

      const loaded = TemplateOperations.load('global-tmpl');
      expect(loaded.name).toBe('global-tmpl');
    });

    it('should prefer project-local over global', () => {
      const globalDir = join(testDir, 'global-config', 'templates');
      mkdirSync(globalDir, { recursive: true });
      const globalTemplate = validTemplate({
        name: 'shared',
        description: 'global version',
      });
      writeFileSync(
        join(globalDir, 'shared.json'),
        JSON.stringify(TeamTemplateSchema.parse(globalTemplate), null, 2),
      );

      TemplateOperations.save(validTemplate({ name: 'shared', description: 'project version' }));

      const loaded = TemplateOperations.load('shared');
      expect(loaded.description).toBe('project version');
    });

    it('should throw for missing template', () => {
      expect(() => TemplateOperations.load('nonexistent')).toThrow(
        'Template "nonexistent" not found',
      );
    });
  });

  describe('list', () => {
    it('should return empty for no templates', () => {
      const result = TemplateOperations.list();
      expect(result).toEqual([]);
    });

    it('should list project templates', () => {
      TemplateOperations.save(validTemplate({ name: 'tmpl-a' }));
      TemplateOperations.save(validTemplate({ name: 'tmpl-b' }));

      const result = TemplateOperations.list();
      expect(result.length).toBe(2);
      expect(result.every((r) => r.source === 'project')).toBe(true);
    });

    it('should list global templates', () => {
      const globalDir = join(testDir, 'global-config', 'templates');
      mkdirSync(globalDir, { recursive: true });
      const template = validTemplate({ name: 'global-one' });
      writeFileSync(
        join(globalDir, 'global-one.json'),
        JSON.stringify(TeamTemplateSchema.parse(template), null, 2),
      );

      const result = TemplateOperations.list();
      expect(result.length).toBe(1);
      expect(result[0].source).toBe('global');
    });

    it('should deduplicate - project overrides global', () => {
      const globalDir = join(testDir, 'global-config', 'templates');
      mkdirSync(globalDir, { recursive: true });
      const globalTemplate = validTemplate({ name: 'shared', description: 'global' });
      writeFileSync(
        join(globalDir, 'shared.json'),
        JSON.stringify(TeamTemplateSchema.parse(globalTemplate), null, 2),
      );

      TemplateOperations.save(validTemplate({ name: 'shared', description: 'project' }));

      const result = TemplateOperations.list();
      expect(result.length).toBe(1);
      expect(result[0].source).toBe('project');
      expect(result[0].description).toBe('project');
    });

    it('should skip invalid JSON files', () => {
      TemplateOperations.save(validTemplate({ name: 'valid-one' }));
      const projectDir = join(testDir, '.opencode', 'opencode-teams', 'templates');
      writeFileSync(join(projectDir, 'corrupt.json'), '{bad json');

      const result = TemplateOperations.list();
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('valid-one');
    });
  });

  describe('delete', () => {
    it('should delete project-local template', () => {
      TemplateOperations.save(validTemplate({ name: 'to-delete' }));
      TemplateOperations.delete('to-delete');
      expect(() => TemplateOperations.load('to-delete')).toThrow();
    });

    it('should throw for nonexistent template', () => {
      expect(() => TemplateOperations.delete('nonexistent')).toThrow(
        'Template "nonexistent" not found in project templates',
      );
    });
  });

  describe('saveFromTeam', () => {
    it('should extract template from team with roles', () => {
      const teamDir = join(testDir, '.opencode', 'opencode-teams', 'teams', 'my-team');
      mkdirSync(teamDir, { recursive: true });
      mkdirSync(join(teamDir, 'inboxes'), { recursive: true });
      const teamConfig = {
        name: 'my-team',
        created: new Date().toISOString(),
        leader: 'agent-1',
        members: [
          {
            agentId: 'agent-1',
            agentName: 'Leader',
            agentType: 'leader',
            joinedAt: new Date().toISOString(),
          },
        ],
        topology: 'hierarchical',
        roles: [{ name: 'leader' }, { name: 'worker' }],
      };
      writeFileSync(join(teamDir, 'config.json'), JSON.stringify(teamConfig, null, 2));

      const result = TemplateOperations.saveFromTeam('from-team', 'my-team');
      expect(result.name).toBe('from-team');
      expect(result.topology).toBe('hierarchical');
      expect(result.roles.length).toBe(2);
    });

    it('should use default description when none provided', () => {
      const teamDir = join(testDir, '.opencode', 'opencode-teams', 'teams', 'my-team');
      mkdirSync(teamDir, { recursive: true });
      mkdirSync(join(teamDir, 'inboxes'), { recursive: true });
      const teamConfig = {
        name: 'my-team',
        created: new Date().toISOString(),
        leader: 'agent-1',
        members: [
          {
            agentId: 'agent-1',
            agentName: 'Leader',
            agentType: 'leader',
            joinedAt: new Date().toISOString(),
          },
        ],
      };
      writeFileSync(join(teamDir, 'config.json'), JSON.stringify(teamConfig, null, 2));

      const result = TemplateOperations.saveFromTeam('from-team', 'my-team');
      expect(result.description).toBe('Extracted from team "my-team"');
    });
  });
});

describe('getBuiltinTemplates', () => {
  it('should return 3 templates', () => {
    const templates = getBuiltinTemplates();
    expect(templates.length).toBe(3);
  });

  it('should all pass schema validation', () => {
    for (const template of getBuiltinTemplates()) {
      expect(() => TeamTemplateSchema.parse(template)).not.toThrow();
    }
  });

  it('code-review should have 3 defaultTasks', () => {
    const codeReview = getBuiltinTemplates().find((t) => t.name === 'code-review');
    expect(codeReview).toBeDefined();
    expect(codeReview!.defaultTasks?.length).toBe(3);
  });

  it('leader-workers should have workflowConfig enabled', () => {
    const leaderWorkers = getBuiltinTemplates().find((t) => t.name === 'leader-workers');
    expect(leaderWorkers).toBeDefined();
    expect(leaderWorkers!.workflowConfig?.enabled).toBe(true);
  });

  it('swarm should have flat topology', () => {
    const swarm = getBuiltinTemplates().find((t) => t.name === 'swarm');
    expect(swarm).toBeDefined();
    expect(swarm!.topology).toBe('flat');
  });
});
