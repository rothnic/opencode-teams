import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dirExists,
  getAgentLockPath,
  getAgentStatePath,
  getAgentsDir,
  getColorPoolPath,
  getServerLogPath,
  getServerStatePath,
  getServersDir,
} from '../src/utils/storage-paths';

describe('storage-paths agent extensions', () => {
  let tmpDir: string;
  let savedTeamsDir: string | undefined;
  let savedProjectRoot: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-sp-agent-'));
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

  describe('getAgentsDir()', () => {
    it('returns path containing agents segment', () => {
      const agentsDir = getAgentsDir();
      expect(agentsDir).toContain('agents');
    });

    it('creates the directory', () => {
      const agentsDir = getAgentsDir();
      expect(dirExists(agentsDir)).toBe(true);
    });
  });

  describe('getAgentStatePath()', () => {
    it('returns path ending in <agentId>.json', () => {
      const path = getAgentStatePath('agent-123');
      expect(path).toEndWith('agent-123.json');
    });

    it('includes agents directory', () => {
      const path = getAgentStatePath('agent-xyz');
      expect(path).toContain('agents');
    });
  });

  describe('getAgentLockPath()', () => {
    it('returns .lock inside agents directory', () => {
      const lockPath = getAgentLockPath();
      expect(lockPath).toEndWith('.lock');
      expect(lockPath).toContain('agents');
    });
  });

  describe('getServersDir()', () => {
    it('returns path containing servers segment', () => {
      const serversDir = getServersDir();
      expect(serversDir).toContain('servers');
    });

    it('creates the directory', () => {
      const serversDir = getServersDir();
      expect(dirExists(serversDir)).toBe(true);
    });
  });

  describe('getServerStatePath()', () => {
    it('returns server.json inside project-hash subdirectory', () => {
      const path = getServerStatePath('abc123');
      expect(path).toEndWith('server.json');
      expect(path).toContain('abc123');
    });

    it('creates the project-hash subdirectory', () => {
      const path = getServerStatePath('myhash');
      const dir = join(path, '..');
      expect(dirExists(dir)).toBe(true);
    });
  });

  describe('getServerLogPath()', () => {
    it('returns server.log inside project-hash subdirectory', () => {
      const path = getServerLogPath('abc123');
      expect(path).toEndWith('server.log');
      expect(path).toContain('abc123');
    });

    it('creates the project-hash subdirectory', () => {
      const path = getServerLogPath('logtest');
      const dir = join(path, '..');
      expect(dirExists(dir)).toBe(true);
    });
  });

  describe('getColorPoolPath()', () => {
    it('returns color-pool.json at project storage root', () => {
      const path = getColorPoolPath();
      expect(path).toEndWith('color-pool.json');
    });

    it('is a sibling of agents and servers dirs', () => {
      const poolPath = getColorPoolPath();
      const agentsDir = getAgentsDir();
      const poolParent = join(poolPath, '..');
      const agentsParent = join(agentsDir, '..');
      expect(poolParent).toBe(agentsParent);
    });
  });
});
