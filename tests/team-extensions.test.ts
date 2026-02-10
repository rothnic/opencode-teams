import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import { TemplateOperations } from '../src/operations/template';
import { TeamConfigSchema, type TeamTemplate } from '../src/types/schemas';
import { readValidatedJSON } from '../src/utils/fs-atomic';
import { dirExists, getTeamConfigPath, getTeamTasksDir } from '../src/utils/storage-paths';

let testDir: string;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'opencode-teams-ext-'));
  savedEnv.OPENCODE_PROJECT_ROOT = process.env.OPENCODE_PROJECT_ROOT;
  savedEnv.OPENCODE_TEAMS_GLOBAL_DIR = process.env.OPENCODE_TEAMS_GLOBAL_DIR;
  savedEnv.OPENCODE_AGENT_ID = process.env.OPENCODE_AGENT_ID;
  savedEnv.OPENCODE_AGENT_NAME = process.env.OPENCODE_AGENT_NAME;
  process.env.OPENCODE_PROJECT_ROOT = testDir;
  process.env.OPENCODE_TEAMS_GLOBAL_DIR = join(testDir, 'global-config');
  process.env.OPENCODE_AGENT_ID = 'test-leader';
  process.env.OPENCODE_AGENT_NAME = 'Test Leader';
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  process.env.OPENCODE_PROJECT_ROOT = savedEnv.OPENCODE_PROJECT_ROOT;
  process.env.OPENCODE_TEAMS_GLOBAL_DIR = savedEnv.OPENCODE_TEAMS_GLOBAL_DIR;
  process.env.OPENCODE_AGENT_ID = savedEnv.OPENCODE_AGENT_ID;
  process.env.OPENCODE_AGENT_NAME = savedEnv.OPENCODE_AGENT_NAME;
});

function saveTestTemplate(overrides: Partial<TeamTemplate> = {}): TeamTemplate {
  const template: TeamTemplate = {
    name: 'test-tmpl',
    description: 'Test template',
    topology: 'flat',
    roles: [{ name: 'leader' }, { name: 'worker' }],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  return TemplateOperations.save(template);
}

describe('spawnTeamFromTemplate', () => {
  it('should create team with template topology and roles', () => {
    saveTestTemplate({ topology: 'hierarchical' });

    const config = TeamOperations.spawnTeamFromTemplate('tmpl-team', 'test-tmpl');
    expect(config.topology).toBe('hierarchical');
    expect(config.roles).toBeDefined();
    expect(config.roles!.length).toBe(2);
    expect(config.templateSource).toBe('test-tmpl');
  });

  it('should use template description when none provided', () => {
    saveTestTemplate({ description: 'Template desc' });

    const config = TeamOperations.spawnTeamFromTemplate('tmpl-team', 'test-tmpl');
    expect(config.description).toBe('Template desc');
  });

  it('should prefer caller description over template description', () => {
    saveTestTemplate({ description: 'Template desc' });

    const config = TeamOperations.spawnTeamFromTemplate(
      'tmpl-team',
      'test-tmpl',
      {},
      {
        description: 'Custom desc',
      },
    );
    expect(config.description).toBe('Custom desc');
  });

  it('should create default tasks from template', () => {
    saveTestTemplate({
      defaultTasks: [
        { title: 'Task A', priority: 'high' },
        { title: 'Task B', priority: 'normal' },
      ],
    });

    TeamOperations.spawnTeamFromTemplate('tmpl-team', 'test-tmpl');
    const tasks = TaskOperations.getTasks('tmpl-team');
    expect(tasks.length).toBe(2);
    expect(tasks.map((t) => t.title).sort()).toEqual(['Task A', 'Task B']);
  });

  it('should store workflowConfig from template', () => {
    saveTestTemplate({
      workflowConfig: {
        enabled: true,
        taskThreshold: 10,
        workerRatio: 2.0,
        cooldownSeconds: 600,
      },
    });

    const config = TeamOperations.spawnTeamFromTemplate('tmpl-team', 'test-tmpl');
    expect(config.workflowConfig).toBeDefined();
    expect(config.workflowConfig!.enabled).toBe(true);
    expect(config.workflowConfig!.taskThreshold).toBe(10);
  });

  it('should throw for nonexistent template', () => {
    expect(() => TeamOperations.spawnTeamFromTemplate('tmpl-team', 'nonexistent')).toThrow(
      'Template "nonexistent" not found',
    );
  });

  it('should persist config that passes schema validation', () => {
    saveTestTemplate();
    TeamOperations.spawnTeamFromTemplate('tmpl-team', 'test-tmpl');

    const configPath = getTeamConfigPath('tmpl-team');
    const persisted = readValidatedJSON(configPath, TeamConfigSchema);
    expect(persisted.templateSource).toBe('test-tmpl');
    expect(persisted.roles).toBeDefined();
  });
});

describe('spawnTeam with options', () => {
  it('should store description when provided', () => {
    const config = TeamOperations.spawnTeam('desc-team', {}, { description: 'My team desc' });
    expect(config.description).toBe('My team desc');

    const persisted = readValidatedJSON(getTeamConfigPath('desc-team'), TeamConfigSchema);
    expect(persisted.description).toBe('My team desc');
  });

  it('should store topology when provided', () => {
    const config = TeamOperations.spawnTeam('topo-team', {}, { topology: 'hierarchical' });
    expect(config.topology).toBe('hierarchical');
  });

  it('should work without options (backward compat)', () => {
    const config = TeamOperations.spawnTeam('plain-team');
    expect(config.description).toBeUndefined();
    expect(config.topology).toBeUndefined();
  });
});

describe('topology enforcement in claimTask', () => {
  it('should allow any agent to claim in flat topology', () => {
    TeamOperations.spawnTeam('flat-team', { agentId: 'leader-1' }, { topology: 'flat' });
    const task = TaskOperations.createTask('flat-team', { title: 'Flat task' });

    const claimed = TaskOperations.claimTask('flat-team', task.id, 'worker-1');
    expect(claimed.owner).toBe('worker-1');
  });

  it('should allow any agent to claim when no topology set', () => {
    TeamOperations.spawnTeam('default-team', { agentId: 'leader-1' });
    const task = TaskOperations.createTask('default-team', { title: 'Default task' });

    const claimed = TaskOperations.claimTask('default-team', task.id, 'worker-1');
    expect(claimed.owner).toBe('worker-1');
  });

  it('should allow leader to claim in hierarchical topology', () => {
    TeamOperations.spawnTeam('hier-team', { agentId: 'leader-1' }, { topology: 'hierarchical' });
    const task = TaskOperations.createTask('hier-team', { title: 'Hier task' });

    const claimed = TaskOperations.claimTask('hier-team', task.id, 'leader-1');
    expect(claimed.owner).toBe('leader-1');
  });

  it('should block worker from claiming in hierarchical topology', () => {
    TeamOperations.spawnTeam('hier-team', { agentId: 'leader-1' }, { topology: 'hierarchical' });
    const task = TaskOperations.createTask('hier-team', { title: 'Hier task' });

    const agentsDir = join(testDir, '.opencode', 'opencode-teams', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'worker-1.json'),
      JSON.stringify({
        id: 'worker-1',
        name: 'Worker',
        teamName: 'hier-team',
        role: 'worker',
        model: 'test',
        sessionId: 'sess-1',
        serverPort: 28000,
        cwd: '/tmp',
        color: '#FF0000',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        heartbeatTs: new Date().toISOString(),
      }),
    );

    expect(() => TaskOperations.claimTask('hier-team', task.id, 'worker-1')).toThrow(
      'Hierarchical topology',
    );
  });

  it('should allow task-manager to claim in hierarchical topology', () => {
    TeamOperations.spawnTeam('hier-team', { agentId: 'leader-1' }, { topology: 'hierarchical' });
    const task = TaskOperations.createTask('hier-team', { title: 'Hier task' });

    const agentsDir = join(testDir, '.opencode', 'opencode-teams', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'tm-1.json'),
      JSON.stringify({
        id: 'tm-1',
        name: 'Task Manager',
        teamName: 'hier-team',
        role: 'task-manager',
        model: 'test',
        sessionId: 'sess-2',
        serverPort: 28001,
        cwd: '/tmp',
        color: '#00FF00',
        status: 'active',
        isActive: true,
        createdAt: new Date().toISOString(),
        heartbeatTs: new Date().toISOString(),
      }),
    );

    const claimed = TaskOperations.claimTask('hier-team', task.id, 'tm-1');
    expect(claimed.owner).toBe('tm-1');
  });
});

describe('deleteTeam', () => {
  it('should delete team directory and contents', () => {
    TeamOperations.spawnTeam('to-delete', { agentId: 'leader-1' });
    TaskOperations.createTask('to-delete', { title: 'Some task' });

    TeamOperations.deleteTeam('to-delete');

    const teams = TeamOperations.discoverTeams();
    expect(teams.find((t) => t.name === 'to-delete')).toBeUndefined();
  });

  it('should delete team tasks directory', () => {
    TeamOperations.spawnTeam('to-delete', { agentId: 'leader-1' });
    TaskOperations.createTask('to-delete', { title: 'Task A' });

    const tasksDir = getTeamTasksDir('to-delete');
    expect(dirExists(tasksDir)).toBe(true);

    TeamOperations.deleteTeam('to-delete');
    expect(dirExists(tasksDir)).toBe(false);
  });

  it('should throw for nonexistent team', () => {
    expect(() => TeamOperations.deleteTeam('nonexistent')).toThrow(
      'Team "nonexistent" does not exist',
    );
  });

  it('should work when team has no tasks', () => {
    TeamOperations.spawnTeam('empty-team', { agentId: 'leader-1' });
    expect(() => TeamOperations.deleteTeam('empty-team')).not.toThrow();
  });
});
