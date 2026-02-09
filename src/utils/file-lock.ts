/**
 * Advisory File Locking via Bun FFI
 *
 * Uses the fcntl() system call via Bun's Foreign Function Interface
 * for cross-process advisory file locking. This ensures concurrent
 * agent operations on shared state files are serialized correctly.
 */

import { dlopen, FFIType } from 'bun:ffi';
import { openSync, closeSync, existsSync, mkdirSync, constants as fsConstants } from 'node:fs';
import { dirname } from 'node:path';

// POSIX fcntl() command constants
const F_SETLK = process.platform === 'darwin' ? 8 : 6;
const F_SETLKW = process.platform === 'darwin' ? 9 : 7;

// POSIX fcntl() lock types
const F_RDLCK = process.platform === 'darwin' ? 1 : 0;
const F_WRLCK = process.platform === 'darwin' ? 3 : 1;
const F_UNLCK = 2;

// POSIX l_whence values
const SEEK_SET = 0;

// Determine libc path based on platform
const LIBC_PATH = process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6';

/**
 * Type for the loaded libc library with flock() symbol.
 * Defined explicitly because ReturnType<typeof dlopen> loses the
 * specific symbol types when stored in a mutable variable.
 */
interface FlockLib {
  symbols: {
    fcntl: (fd: number, cmd: number, lock: Uint8Array) => number;
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
      fcntl: {
        args: [FFIType.i32, FFIType.i32, FFIType.ptr],
        returns: FFIType.i32,
      },
    }) as unknown as FlockLib;
  }
  return _libc;
}

function buildFlock(type: number): Uint8Array {
  // struct flock layout (Linux/macOS):
  // short l_type; short l_whence; off_t l_start; off_t l_len; pid_t l_pid;
  // Use a 32-byte buffer for alignment safety.
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);

  view.setInt16(0, type, true);
  view.setInt16(2, SEEK_SET, true);
  view.setBigInt64(4, 0n, true); // l_start
  view.setBigInt64(12, 0n, true); // l_len (0 = to EOF)
  view.setInt32(20, 0, true); // l_pid (ignored when setting)

  return new Uint8Array(buffer);
}

function ensurePosixPlatform(): void {
  if (process.platform === 'win32') {
    throw new Error('Advisory file locks are not supported on Windows');
  }
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
  ensurePosixPlatform();
  // Ensure parent directory exists
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Open (or create) the lock file. Use O_RDWR to ensure we can lock it.
  const fd = openSync(lockPath, fsConstants.O_RDWR | fsConstants.O_CREAT, 0o644);

  // Acquire the lock (blocking)
  const type = exclusive ? F_WRLCK : F_RDLCK;
  const lock = buildFlock(type);
  const ret = getLibc().symbols.fcntl(fd, F_SETLKW, lock);

  if (ret === -1) {
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
        const unlock = buildFlock(F_UNLCK);
        getLibc().symbols.fcntl(fd, F_SETLK, unlock);
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
  ensurePosixPlatform();
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const fd = openSync(lockPath, fsConstants.O_RDWR | fsConstants.O_CREAT, 0o644);

  const type = exclusive ? F_WRLCK : F_RDLCK;
  const lock = buildFlock(type);
  const ret = getLibc().symbols.fcntl(fd, F_SETLK, lock);

  if (ret === -1) {
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
        const unlock = buildFlock(F_UNLCK);
        getLibc().symbols.fcntl(fd, F_SETLK, unlock);
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
