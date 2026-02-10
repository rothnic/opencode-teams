/**
 * Tests for src/operations/server-manager.ts
 *
 * Covers pure function tests that don't require a running OpenCode instance.
 * Full server start/stop tests are in WP09 integration tests.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ServerManager } from '../src/operations/server-manager';
import { ServerInfoSchema } from '../src/types/schemas';
import { writeAtomicJSON } from '../src/utils/fs-atomic';
import { getServerStatePath } from '../src/utils/storage-paths';

describe('ServerManager', () => {
  let tmpDir: string;
  let savedTeamsDir: string | undefined;
  let savedProjectRoot: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-sm-'));
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

  // ── portForProject ─────────────────────────────────────────────────────

  describe('portForProject()', () => {
    it('returns consistent port for same path', () => {
      const port1 = ServerManager.portForProject('/some/project');
      const port2 = ServerManager.portForProject('/some/project');
      expect(port1).toBe(port2);
    });

    it('returns different ports for different paths', () => {
      const port1 = ServerManager.portForProject('/project/alpha');
      const port2 = ServerManager.portForProject('/project/beta');
      expect(port1).not.toBe(port2);
    });

    it('always returns port in 28000-28999 range', () => {
      for (let i = 0; i < 100; i++) {
        const port = ServerManager.portForProject(`/test/project-${i}-${Math.random()}`);
        expect(port).toBeGreaterThanOrEqual(28000);
        expect(port).toBeLessThanOrEqual(28999);
      }
    });

    it('resolves relative paths to absolute before hashing', () => {
      const port1 = ServerManager.portForProject('./relative/path');
      const port2 = ServerManager.portForProject(resolve('./relative/path'));
      expect(port1).toBe(port2);
    });

    it('returns a number', () => {
      const port = ServerManager.portForProject('/any/path');
      expect(typeof port).toBe('number');
      expect(Number.isInteger(port)).toBe(true);
    });
  });

  // ── projectHash ────────────────────────────────────────────────────────

  describe('projectHash()', () => {
    it('returns consistent hash for same path', () => {
      const hash1 = ServerManager.projectHash('/some/project');
      const hash2 = ServerManager.projectHash('/some/project');
      expect(hash1).toBe(hash2);
    });

    it('returns 32-character hex string', () => {
      const hash = ServerManager.projectHash('/test/project');
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[a-f0-9]{32}$/);
    });

    it('returns different hashes for different paths', () => {
      const hash1 = ServerManager.projectHash('/project/one');
      const hash2 = ServerManager.projectHash('/project/two');
      expect(hash1).not.toBe(hash2);
    });

    it('resolves relative paths before hashing', () => {
      const hash1 = ServerManager.projectHash('./relative');
      const hash2 = ServerManager.projectHash(resolve('./relative'));
      expect(hash1).toBe(hash2);
    });
  });

  // ── ServerInfoSchema ───────────────────────────────────────────────────

  describe('ServerInfoSchema', () => {
    it('validates a correct server info object', () => {
      const info = {
        projectPath: '/some/project',
        projectHash: 'abc123def456abc123def456abc123de',
        pid: 12345,
        port: 28100,
        hostname: '127.0.0.1',
        isRunning: true,
        activeSessions: 2,
        logPath: '/tmp/server.log',
        startedAt: new Date().toISOString(),
        lastHealthCheck: new Date().toISOString(),
      };
      const result = ServerInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });

    it('rejects port outside 28000-28999 range', () => {
      const info = {
        projectPath: '/some/project',
        projectHash: 'abc123def456abc123def456abc123de',
        pid: 12345,
        port: 3000,
        hostname: '127.0.0.1',
        isRunning: true,
        activeSessions: 0,
        startedAt: new Date().toISOString(),
      };
      const result = ServerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('rejects negative pid', () => {
      const info = {
        projectPath: '/some/project',
        projectHash: 'abc123def456abc123def456abc123de',
        pid: -1,
        port: 28100,
        hostname: '127.0.0.1',
        isRunning: true,
        activeSessions: 0,
        startedAt: new Date().toISOString(),
      };
      const result = ServerInfoSchema.safeParse(info);
      expect(result.success).toBe(false);
    });

    it('round-trips through write and read', async () => {
      const info = {
        projectPath: '/round/trip',
        projectHash: 'aabbccddee112233aabbccddee112233',
        pid: 9999,
        port: 28500,
        hostname: '127.0.0.1',
        isRunning: true,
        activeSessions: 1,
        logPath: '/tmp/test.log',
        startedAt: new Date().toISOString(),
        lastHealthCheck: new Date().toISOString(),
      };

      const hash = ServerManager.projectHash('/round/trip');
      const statePath = getServerStatePath(hash);
      writeAtomicJSON(statePath, info, ServerInfoSchema);

      const { readValidatedJSON: readJSON } = await import('../src/utils/fs-atomic');
      const read = readJSON(statePath, ServerInfoSchema);
      expect(read.projectPath).toBe(info.projectPath);
      expect(read.pid).toBe(info.pid);
      expect(read.port).toBe(info.port);
      expect(read.isRunning).toBe(info.isRunning);
    });

    it('allows optional logPath and lastHealthCheck', () => {
      const info = {
        projectPath: '/minimal',
        projectHash: 'abc123def456abc123def456abc123de',
        pid: 1000,
        port: 28001,
        hostname: '127.0.0.1',
        isRunning: false,
        activeSessions: 0,
        startedAt: new Date().toISOString(),
      };
      const result = ServerInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });
  });

  // ── status ─────────────────────────────────────────────────────────────

  describe('status()', () => {
    it('returns null when no state file exists', async () => {
      const result = await ServerManager.status('/nonexistent/project');
      expect(result).toBeNull();
    });

    it('returns server info with isRunning=false for dead PID', async () => {
      const hash = ServerManager.projectHash('/dead/server');
      const statePath = getServerStatePath(hash);
      const info = {
        projectPath: '/dead/server',
        projectHash: hash,
        pid: 999999, // Almost certainly not running
        port: 28123,
        hostname: '127.0.0.1',
        isRunning: true,
        activeSessions: 0,
        startedAt: new Date().toISOString(),
      };
      writeAtomicJSON(statePath, info, ServerInfoSchema);

      const result = await ServerManager.status('/dead/server');
      expect(result).not.toBeNull();
      expect(result!.isRunning).toBe(false);
    });
  });
});
