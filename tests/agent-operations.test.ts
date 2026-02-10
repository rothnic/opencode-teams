import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AgentOperations } from '../src/operations/agent';
import type { AgentState } from '../src/types/schemas';
import { TeamConfigSchema } from '../src/types/schemas';
import { writeAtomicJSON } from '../src/utils/fs-atomic';
import { getTeamConfigPath, getTeamDir } from '../src/utils/storage-paths';

function makeTeamConfig(teamName: string, projectRoot: string) {
  const configPath = getTeamConfigPath(teamName, projectRoot);
  const teamDir = getTeamDir(teamName, projectRoot);
  rmSync(teamDir, { recursive: true, force: true });
  const config = {
    name: teamName,
    created: new Date().toISOString(),
    leader: 'leader-001',
    members: [
      {
        agentId: 'leader-001',
        agentName: 'Leader',
        agentType: 'leader',
        joinedAt: new Date().toISOString(),
      },
    ],
  };
  writeAtomicJSON(configPath, config, TeamConfigSchema);
  return config;
}

function makeAgentState(overrides: Partial<AgentState> = {}): AgentState {
  const now = new Date().toISOString();
  return {
    id: 'agent-001',
    name: 'test-agent',
    teamName: 'test-team',
    role: 'worker',
    model: 'claude-sonnet-4-20250514',
    sessionId: 'sess-001',
    serverPort: 28100,
    cwd: '/tmp/test',
    color: '#FF5733',
    status: 'active',
    isActive: true,
    createdAt: now,
    heartbeatTs: now,
    consecutiveMisses: 0,
    sessionRotationCount: 0,
    ...overrides,
  };
}

describe('AgentOperations', () => {
  let tmpDir: string;
  let savedTeamsDir: string | undefined;
  let savedProjectRoot: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-agent-'));
    savedTeamsDir = process.env.OPENCODE_TEAMS_DIR;
    savedProjectRoot = process.env.OPENCODE_PROJECT_ROOT;
    process.env.OPENCODE_TEAMS_DIR = join(tmpDir, 'storage');
    delete process.env.OPENCODE_PROJECT_ROOT;
  });

  afterEach(() => {
    if (savedTeamsDir !== undefined) {
      process.env.OPENCODE_TEAMS_DIR = savedTeamsDir;
    } else {
      delete process.env.OPENCODE_TEAMS_DIR;
    }
    if (savedProjectRoot !== undefined) {
      process.env.OPENCODE_PROJECT_ROOT = savedProjectRoot;
    } else {
      delete process.env.OPENCODE_PROJECT_ROOT;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('registerAgent()', () => {
    it('creates agent state file and returns validated state', () => {
      makeTeamConfig('test-team', tmpDir);
      const state = makeAgentState();
      const result = AgentOperations.registerAgent(state, tmpDir);
      expect(result.id).toBe('agent-001');
      expect(result.name).toBe('test-agent');
      expect(result.role).toBe('worker');
    });

    it('adds agent to team config members', () => {
      makeTeamConfig('test-team', tmpDir);
      const state = makeAgentState();
      AgentOperations.registerAgent(state, tmpDir);

      const retrieved = AgentOperations.getAgentState('agent-001', tmpDir);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.teamName).toBe('test-team');
    });

    it('rejects duplicate agent registration', () => {
      makeTeamConfig('test-team', tmpDir);
      const state = makeAgentState();
      AgentOperations.registerAgent(state, tmpDir);

      expect(() => AgentOperations.registerAgent(state, tmpDir)).toThrow(
        "Agent 'agent-001' is already registered",
      );
    });

    it('validates schema on registration', () => {
      makeTeamConfig('test-team', tmpDir);
      const badState = makeAgentState({ id: '' });
      expect(() => AgentOperations.registerAgent(badState, tmpDir)).toThrow();
    });
  });

  describe('getAgentState()', () => {
    it('returns agent state by ID', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(makeAgentState(), tmpDir);

      const result = AgentOperations.getAgentState('agent-001', tmpDir);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('agent-001');
      expect(result!.status).toBe('active');
    });

    it('returns null for missing agent', () => {
      const result = AgentOperations.getAgentState('nonexistent', tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('listAgents()', () => {
    it('returns empty array when no agents exist', () => {
      const result = AgentOperations.listAgents(undefined, tmpDir);
      expect(result).toEqual([]);
    });

    it('lists all registered agents', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(makeAgentState({ id: 'a1', sessionId: 's1' }), tmpDir);
      AgentOperations.registerAgent(makeAgentState({ id: 'a2', sessionId: 's2' }), tmpDir);

      const result = AgentOperations.listAgents(undefined, tmpDir);
      expect(result).toHaveLength(2);
    });

    it('filters by teamName', () => {
      makeTeamConfig('test-team', tmpDir);
      makeTeamConfig('other-team', tmpDir);
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a1', sessionId: 's1', teamName: 'test-team' }),
        tmpDir,
      );
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a2', sessionId: 's2', teamName: 'other-team' }),
        tmpDir,
      );

      const result = AgentOperations.listAgents({ teamName: 'test-team' }, tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });

    it('filters by status', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a1', sessionId: 's1', status: 'active' }),
        tmpDir,
      );
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a2', sessionId: 's2', status: 'idle' }),
        tmpDir,
      );

      const result = AgentOperations.listAgents({ status: 'idle' }, tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a2');
    });

    it('filters by isActive', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a1', sessionId: 's1', isActive: true }),
        tmpDir,
      );
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a2', sessionId: 's2', isActive: false }),
        tmpDir,
      );

      const result = AgentOperations.listAgents({ isActive: false }, tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a2');
    });
  });

  describe('updateAgentState()', () => {
    it('updates specified fields', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(makeAgentState(), tmpDir);

      const updated = AgentOperations.updateAgentState(
        'agent-001',
        { status: 'idle', isActive: false },
        tmpDir,
      );
      expect(updated.status).toBe('idle');
      expect(updated.isActive).toBe(false);
    });

    it('preserves immutable id and createdAt', () => {
      makeTeamConfig('test-team', tmpDir);
      const original = AgentOperations.registerAgent(makeAgentState(), tmpDir);

      const updated = AgentOperations.updateAgentState(
        'agent-001',
        { id: 'hacked-id', createdAt: '2000-01-01T00:00:00.000Z' },
        tmpDir,
      );
      expect(updated.id).toBe(original.id);
      expect(updated.createdAt).toBe(original.createdAt);
    });

    it('sets updatedAt timestamp', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(makeAgentState(), tmpDir);

      const updated = AgentOperations.updateAgentState('agent-001', { status: 'idle' }, tmpDir);
      expect(updated.updatedAt).toBeDefined();
    });

    it('throws for missing agent', () => {
      expect(() =>
        AgentOperations.updateAgentState('nonexistent', { status: 'idle' }, tmpDir),
      ).toThrow("Agent 'nonexistent' not found");
    });
  });

  describe('findAgentBySessionId()', () => {
    it('finds agent by session ID', () => {
      makeTeamConfig('test-team', tmpDir);
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a1', sessionId: 'target-session' }),
        tmpDir,
      );
      AgentOperations.registerAgent(
        makeAgentState({ id: 'a2', sessionId: 'other-session' }),
        tmpDir,
      );

      const result = AgentOperations.findAgentBySessionId('target-session', tmpDir);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('a1');
    });

    it('returns null for unknown session ID', () => {
      const result = AgentOperations.findAgentBySessionId('nonexistent', tmpDir);
      expect(result).toBeNull();
    });
  });
});
