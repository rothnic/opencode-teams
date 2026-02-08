/**
 * Tests for src/utils/storage-paths.ts
 *
 * Covers project root detection, directory resolution, env var overrides,
 * and filesystem helper functions.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  detectProjectRoot,
  getProjectStorageDir,
  getTeamsDir,
  getTasksDir,
  getTeamDir,
  getTeamConfigPath,
  getInboxesDir,
  getAgentInboxPath,
  getTeamLockPath,
  getTaskLockPath,
  ensureDir,
  fileExists,
  dirExists,
} from '../src/utils/storage-paths';

describe('storage-paths', () => {
  let tmpDir: string;
  let savedTeamsDir: string | undefined;
  let savedProjectRoot: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-sp-'));
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

  // ── detectProjectRoot ──────────────────────────────────────────────────

  describe('detectProjectRoot()', () => {
    it('finds project root by .git marker', () => {
      const projectDir = join(tmpDir, 'my-project');
      mkdirSync(join(projectDir, '.git'), { recursive: true });
      const subDir = join(projectDir, 'src', 'deep');
      mkdirSync(subDir, { recursive: true });

      const root = detectProjectRoot(subDir);
      expect(root).toBe(projectDir);
    });

    it('finds project root by package.json marker', () => {
      const projectDir = join(tmpDir, 'pkg-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), '{}');
      const subDir = join(projectDir, 'lib', 'nested');
      mkdirSync(subDir, { recursive: true });

      const root = detectProjectRoot(subDir);
      expect(root).toBe(projectDir);
    });

    it('finds project root by opencode.json marker', () => {
      const projectDir = join(tmpDir, 'oc-project');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'opencode.json'), '{}');
      const subDir = join(projectDir, 'a', 'b');
      mkdirSync(subDir, { recursive: true });

      const root = detectProjectRoot(subDir);
      expect(root).toBe(projectDir);
    });

    it('finds project root by .opencode directory marker', () => {
      const projectDir = join(tmpDir, 'dotoc-project');
      mkdirSync(join(projectDir, '.opencode'), { recursive: true });
      const subDir = join(projectDir, 'src');
      mkdirSync(subDir, { recursive: true });

      const root = detectProjectRoot(subDir);
      expect(root).toBe(projectDir);
    });

    it('uses OPENCODE_PROJECT_ROOT env var override', () => {
      const override = join(tmpDir, 'override-root');
      mkdirSync(override, { recursive: true });
      process.env.OPENCODE_PROJECT_ROOT = override;

      const root = detectProjectRoot(tmpDir);
      expect(root).toBe(override);
    });

    it('falls back to cwd when no marker is found', () => {
      // Use a bare temp dir with no markers anywhere up the chain
      const bareDir = join(tmpDir, 'bare');
      mkdirSync(bareDir, { recursive: true });

      // Since the temp dir is under /tmp which likely has no markers,
      // detectProjectRoot should walk up to / and fall back to cwd
      const root = detectProjectRoot(bareDir);
      // Falls back to process.cwd() when no marker found
      expect(typeof root).toBe('string');
      expect(root.length).toBeGreaterThan(0);
    });
  });

  // ── getProjectStorageDir ───────────────────────────────────────────────

  describe('getProjectStorageDir()', () => {
    it('returns <root>/.opencode/opencode-teams/ without env override', () => {
      delete process.env.OPENCODE_TEAMS_DIR;
      const projectDir = join(tmpDir, 'proj');
      mkdirSync(projectDir, { recursive: true });
      writeFileSync(join(projectDir, 'package.json'), '{}');

      const storageDir = getProjectStorageDir(projectDir);
      expect(storageDir).toBe(join(projectDir, '.opencode', 'opencode-teams'));
      expect(dirExists(storageDir)).toBe(true);
    });

    it('uses OPENCODE_TEAMS_DIR env var when set', () => {
      const customDir = join(tmpDir, 'custom-storage');
      process.env.OPENCODE_TEAMS_DIR = customDir;

      const storageDir = getProjectStorageDir();
      expect(storageDir).toBe(customDir);
      expect(dirExists(storageDir)).toBe(true);
    });

    it('creates the directory if it does not exist', () => {
      const storageDir = getProjectStorageDir();
      expect(dirExists(storageDir)).toBe(true);
    });
  });

  // ── getTeamsDir ────────────────────────────────────────────────────────

  describe('getTeamsDir()', () => {
    it('returns teams subdirectory under project storage', () => {
      const teamsDir = getTeamsDir();
      const storageDir = getProjectStorageDir();
      expect(teamsDir).toBe(join(storageDir, 'teams'));
    });

    it('creates the directory', () => {
      const teamsDir = getTeamsDir();
      expect(dirExists(teamsDir)).toBe(true);
    });
  });

  // ── getTasksDir ────────────────────────────────────────────────────────

  describe('getTasksDir()', () => {
    it('returns tasks subdirectory under project storage', () => {
      const tasksDir = getTasksDir();
      const storageDir = getProjectStorageDir();
      expect(tasksDir).toBe(join(storageDir, 'tasks'));
    });

    it('creates the directory', () => {
      const tasksDir = getTasksDir();
      expect(dirExists(tasksDir)).toBe(true);
    });
  });

  // ── getTeamDir ─────────────────────────────────────────────────────────

  describe('getTeamDir()', () => {
    it('returns team-specific directory under teams/', () => {
      const teamDir = getTeamDir('alpha');
      const teamsDir = getTeamsDir();
      expect(teamDir).toBe(join(teamsDir, 'alpha'));
    });

    it('returns correct path for different team names', () => {
      const dir1 = getTeamDir('team-a');
      const dir2 = getTeamDir('team-b');
      expect(dir1).not.toBe(dir2);
      expect(dir1).toEndWith('team-a');
      expect(dir2).toEndWith('team-b');
    });
  });

  // ── getTeamConfigPath ──────────────────────────────────────────────────

  describe('getTeamConfigPath()', () => {
    it('returns config.json inside team directory', () => {
      const configPath = getTeamConfigPath('alpha');
      const teamDir = getTeamDir('alpha');
      expect(configPath).toBe(join(teamDir, 'config.json'));
    });
  });

  // ── getInboxesDir ──────────────────────────────────────────────────────

  describe('getInboxesDir()', () => {
    it('returns inboxes subdirectory inside team directory', () => {
      const inboxesDir = getInboxesDir('alpha');
      const teamDir = getTeamDir('alpha');
      expect(inboxesDir).toBe(join(teamDir, 'inboxes'));
    });

    it('creates the directory', () => {
      const inboxesDir = getInboxesDir('alpha');
      expect(dirExists(inboxesDir)).toBe(true);
    });
  });

  // ── getAgentInboxPath ──────────────────────────────────────────────────

  describe('getAgentInboxPath()', () => {
    it('returns <agent-id>.json inside inboxes dir', () => {
      const inboxPath = getAgentInboxPath('alpha', 'agent-1');
      const inboxesDir = getInboxesDir('alpha');
      expect(inboxPath).toBe(join(inboxesDir, 'agent-1.json'));
    });

    it('uses the agentId in the filename', () => {
      const path1 = getAgentInboxPath('alpha', 'worker-a');
      const path2 = getAgentInboxPath('alpha', 'worker-b');
      expect(path1).toEndWith('worker-a.json');
      expect(path2).toEndWith('worker-b.json');
      expect(path1).not.toBe(path2);
    });
  });

  // ── getTeamLockPath ────────────────────────────────────────────────────

  describe('getTeamLockPath()', () => {
    it('returns .lock file inside team directory', () => {
      const lockPath = getTeamLockPath('alpha');
      const teamDir = getTeamDir('alpha');
      expect(lockPath).toBe(join(teamDir, '.lock'));
    });
  });

  // ── getTaskLockPath ────────────────────────────────────────────────────

  describe('getTaskLockPath()', () => {
    it('returns .lock file inside team tasks directory', () => {
      const lockPath = getTaskLockPath('alpha');
      expect(lockPath).toEndWith('.lock');
      // Should be under tasks/<team>/.lock
      expect(lockPath).toContain('tasks');
      expect(lockPath).toContain('alpha');
    });
  });

  // ── ensureDir ──────────────────────────────────────────────────────────

  describe('ensureDir()', () => {
    it('creates a directory recursively', () => {
      const deepDir = join(tmpDir, 'a', 'b', 'c', 'd');
      expect(dirExists(deepDir)).toBe(false);

      ensureDir(deepDir);
      expect(dirExists(deepDir)).toBe(true);
    });

    it('is idempotent on existing directory', () => {
      const dir = join(tmpDir, 'existing');
      mkdirSync(dir, { recursive: true });

      // Should not throw
      ensureDir(dir);
      expect(dirExists(dir)).toBe(true);
    });
  });

  // ── fileExists ─────────────────────────────────────────────────────────

  describe('fileExists()', () => {
    it('returns true for an existing file', () => {
      const filePath = join(tmpDir, 'test-file.txt');
      writeFileSync(filePath, 'hello');
      expect(fileExists(filePath)).toBe(true);
    });

    it('returns false for a non-existent path', () => {
      expect(fileExists(join(tmpDir, 'nope.txt'))).toBe(false);
    });

    it('returns false for a directory', () => {
      const dir = join(tmpDir, 'a-dir');
      mkdirSync(dir, { recursive: true });
      expect(fileExists(dir)).toBe(false);
    });
  });

  // ── dirExists ──────────────────────────────────────────────────────────

  describe('dirExists()', () => {
    it('returns true for an existing directory', () => {
      expect(dirExists(tmpDir)).toBe(true);
    });

    it('returns false for a non-existent path', () => {
      expect(dirExists(join(tmpDir, 'nonexistent'))).toBe(false);
    });

    it('returns false for a file', () => {
      const filePath = join(tmpDir, 'a-file.txt');
      writeFileSync(filePath, 'content');
      expect(dirExists(filePath)).toBe(false);
    });
  });

  // ── OPENCODE_TEAMS_DIR env override ────────────────────────────────────

  describe('OPENCODE_TEAMS_DIR env override', () => {
    it('overrides the project storage directory', () => {
      const override = join(tmpDir, 'env-override');
      process.env.OPENCODE_TEAMS_DIR = override;

      const storageDir = getProjectStorageDir();
      expect(storageDir).toBe(override);
    });

    it('affects teams and tasks directory resolution', () => {
      const override = join(tmpDir, 'env-override-2');
      process.env.OPENCODE_TEAMS_DIR = override;

      const teamsDir = getTeamsDir();
      const tasksDir = getTasksDir();

      expect(teamsDir).toBe(join(override, 'teams'));
      expect(tasksDir).toBe(join(override, 'tasks'));
    });
  });
});
