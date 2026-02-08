/**
 * Advisory File Locking via Bun FFI
 *
 * Uses the flock() system call via Bun's Foreign Function Interface
 * for cross-process advisory file locking. This ensures concurrent
 * agent operations on shared state files are serialized correctly.
 *
 * flock() is preferred over fcntl() for locking because:
 * - It is not a variadic function, making FFI bindings reliable
 * - It provides whole-file advisory locking (which is what we need)
 * - It is simpler and equally correct for our use case
 */

import { dlopen, FFIType } from 'bun:ffi';
import { openSync, closeSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// POSIX flock() operation constants
const LOCK_SH = 1; // Shared (read) lock
const LOCK_EX = 2; // Exclusive (write) lock
const LOCK_NB = 4; // Non-blocking flag (OR with SH/EX)
const LOCK_UN = 8; // Unlock

// Determine libc path based on platform
const LIBC_PATH = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';

/**
 * Type for the loaded libc library with flock() symbol.
 * Defined explicitly because ReturnType<typeof dlopen> loses the
 * specific symbol types when stored in a mutable variable.
 */
interface FlockLib {
  symbols: {
    flock: (fd: number, op: number) => number;
  };
  close(): void;
}

/**
 * Lazily load libc symbols. We cache the loaded library to avoid
 * repeatedly opening it. The symbols are loaded once and reused.
 */
let _libc: FlockLib | null = null;

function getLibc(): FlockLib {
  if (!_libc) {
    _libc = dlopen(LIBC_PATH, {
      flock: {
        args: [FFIType.i32, FFIType.i32],
        returns: FFIType.i32,
      },
    }) as unknown as FlockLib;
  }
  return _libc;
}

/**
 * Handle returned by acquireLock(). Must be released when done.
 */
export interface FileLock {
  /** The file descriptor of the lock file */
  readonly fd: number;
  /** The path of the lock file */
  readonly path: string;
  /** Release the lock and close the file descriptor */
  release(): void;
}

/**
 * Acquire an advisory file lock. Blocks until the lock is available.
 *
 * @param lockPath - Path to the lock file (will be created if needed)
 * @param exclusive - If true (default), acquires exclusive lock; otherwise shared
 * @returns A FileLock handle that must be released
 * @throws Error if the lock cannot be acquired
 */
export function acquireLock(lockPath: string, exclusive = true): FileLock {
  // Ensure parent directory exists
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Open (or create) the lock file. Use 'a' mode to avoid truncation
  // while still creating the file if it doesn't exist.
  const fd = openSync(lockPath, 'a');

  // Acquire the lock (blocking)
  const op = exclusive ? LOCK_EX : LOCK_SH;
  const ret = getLibc().symbols.flock(fd, op);

  if (ret !== 0) {
    closeSync(fd);
    throw new Error(`Failed to acquire lock on ${lockPath}`);
  }

  let released = false;

  return {
    fd,
    path: lockPath,
    release() {
      if (released) return;
      released = true;
      try {
        getLibc().symbols.flock(fd, LOCK_UN);
      } finally {
        closeSync(fd);
      }
    },
  };
}

/**
 * Try to acquire a lock without blocking.
 *
 * @returns A FileLock if acquired, or null if the lock is held by another process
 */
export function tryAcquireLock(lockPath: string, exclusive = true): FileLock | null {
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const fd = openSync(lockPath, 'a');

  const op = (exclusive ? LOCK_EX : LOCK_SH) | LOCK_NB;
  const ret = getLibc().symbols.flock(fd, op);

  if (ret !== 0) {
    // Lock is held by another process
    closeSync(fd);
    return null;
  }

  let released = false;

  return {
    fd,
    path: lockPath,
    release() {
      if (released) return;
      released = true;
      try {
        getLibc().symbols.flock(fd, LOCK_UN);
      } finally {
        closeSync(fd);
      }
    },
  };
}

/**
 * Execute a function while holding an exclusive lock.
 * The lock is automatically released when the function completes or throws.
 *
 * @param lockPath - Path to the lock file
 * @param fn - Synchronous function to execute under the lock
 * @param exclusive - If true (default), acquires exclusive lock
 * @returns The return value of fn
 */
export function withLock<T>(lockPath: string, fn: () => T, exclusive = true): T {
  const lock = acquireLock(lockPath, exclusive);
  try {
    return fn();
  } finally {
    lock.release();
  }
}

/**
 * Execute an async function while holding an exclusive lock.
 * The lock is automatically released when the promise resolves or rejects.
 *
 * @param lockPath - Path to the lock file
 * @param fn - Async function to execute under the lock
 * @param exclusive - If true (default), acquires exclusive lock
 * @returns The resolved value of fn
 */
export async function withLockAsync<T>(
  lockPath: string,
  fn: () => Promise<T>,
  exclusive = true
): Promise<T> {
  const lock = acquireLock(lockPath, exclusive);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}
