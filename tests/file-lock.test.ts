/**
 * Tests for src/utils/file-lock.ts
 *
 * Covers advisory file locking via flock(): acquire, release, try-acquire,
 * withLock (sync), withLockAsync, and double-release safety.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { acquireLock, tryAcquireLock, withLock, withLockAsync } from '../src/utils/file-lock';

describe('file-lock', () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-fl-'));
    lockPath = join(tmpDir, 'test.lock');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── acquireLock ────────────────────────────────────────────────────────

  describe('acquireLock()', () => {
    it('creates the lock file and returns a handle', () => {
      const lock = acquireLock(lockPath);

      expect(lock).toBeDefined();
      expect(lock.fd).toBeGreaterThanOrEqual(0);
      expect(lock.path).toBe(lockPath);
      expect(typeof lock.release).toBe('function');
      expect(existsSync(lockPath)).toBe(true);

      lock.release();
    });

    it('creates parent directories if they do not exist', () => {
      const deepLockPath = join(tmpDir, 'a', 'b', 'c', 'deep.lock');
      const lock = acquireLock(deepLockPath);

      expect(existsSync(deepLockPath)).toBe(true);

      lock.release();
    });

    it('release() actually releases the lock', () => {
      const lock = acquireLock(lockPath);
      lock.release();

      // After release, another lock acquisition should succeed immediately
      const lock2 = tryAcquireLock(lockPath);
      expect(lock2).not.toBeNull();
      lock2!.release();
    });
  });

  // ── tryAcquireLock ─────────────────────────────────────────────────────

  describe('tryAcquireLock()', () => {
    it('returns a lock handle when lock is available', () => {
      const lock = tryAcquireLock(lockPath);
      expect(lock).not.toBeNull();
      expect(lock!.fd).toBeGreaterThanOrEqual(0);
      expect(lock!.path).toBe(lockPath);

      lock!.release();
    });

    it('returns null when exclusive lock is already held (same-process different fd)', () => {
      // Acquire an exclusive lock on the file
      const lock1 = acquireLock(lockPath, true);

      // Try to acquire a second exclusive lock on the same file (non-blocking).
      // On Linux, flock() treats different file descriptors independently even
      // within the same process, so this should be denied.
      const lock2 = tryAcquireLock(lockPath, true);
      expect(lock2).toBeNull();

      lock1.release();
    });

    it('succeeds after the held lock is released', () => {
      const lock1 = acquireLock(lockPath);
      lock1.release();

      const lock2 = tryAcquireLock(lockPath);
      expect(lock2).not.toBeNull();
      lock2!.release();
    });
  });

  // ── withLock (synchronous) ─────────────────────────────────────────────

  describe('withLock()', () => {
    it('executes the function and returns its value', () => {
      const result = withLock(lockPath, () => 42);
      expect(result).toBe(42);
    });

    it('releases the lock after the function completes', () => {
      withLock(lockPath, () => 'done');

      // Lock should be released; tryAcquireLock should succeed
      const lock = tryAcquireLock(lockPath);
      expect(lock).not.toBeNull();
      lock!.release();
    });

    it('releases the lock even when the function throws', () => {
      expect(() => {
        withLock(lockPath, () => {
          throw new Error('boom');
        });
      }).toThrow('boom');

      // Lock should still be released
      const lock = tryAcquireLock(lockPath);
      expect(lock).not.toBeNull();
      lock!.release();
    });

    it('passes through complex return values', () => {
      const data = { items: [1, 2, 3], name: 'test' };
      const result = withLock(lockPath, () => data);
      expect(result).toEqual(data);
    });
  });

  // ── withLockAsync ──────────────────────────────────────────────────────

  describe('withLockAsync()', () => {
    it('executes an async function and returns its resolved value', async () => {
      const result = await withLockAsync(lockPath, async () => {
        return 'async-result';
      });
      expect(result).toBe('async-result');
    });

    it('releases the lock after async function resolves', async () => {
      await withLockAsync(lockPath, async () => {
        await new Promise((r) => globalThis.setTimeout(r, 10));
        return true;
      });

      const lock = tryAcquireLock(lockPath);
      expect(lock).not.toBeNull();
      lock!.release();
    });

    it('releases the lock when async function rejects', async () => {
      await expect(
        withLockAsync(lockPath, async () => {
          throw new Error('async-boom');
        })
      ).rejects.toThrow('async-boom');

      // Lock should still be released
      const lock = tryAcquireLock(lockPath);
      expect(lock).not.toBeNull();
      lock!.release();
    });
  });

  // ── Double release safety ──────────────────────────────────────────────

  describe('double release', () => {
    it('does not throw when release() is called twice', () => {
      const lock = acquireLock(lockPath);
      lock.release();
      // Second release should be a no-op
      expect(() => lock.release()).not.toThrow();
    });

    it('does not throw on tryAcquireLock handle double release', () => {
      const lock = tryAcquireLock(lockPath);
      expect(lock).not.toBeNull();
      lock!.release();
      expect(() => lock!.release()).not.toThrow();
    });
  });
});
