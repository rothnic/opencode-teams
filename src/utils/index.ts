/**
 * Utility functions for OpenCode Teams Plugin
 *
 * Re-exports from the new modular utility files for backward compatibility.
 * New code should import directly from the specific modules.
 */

// Re-export storage path utilities
export {
  getTeamsDir,
  getTasksDir,
  getTeamDir,
  getTeamConfigPath,
  getTeamTasksDir,
  getTeamLockPath,
  getTaskLockPath,
  getInboxesDir,
  getAgentInboxPath,
  getGlobalConfigDir,
  getProjectStorageDir,
  getTemplatesDir,
  ensureDir,
  fileExists,
  dirExists,
  detectProjectRoot,
} from './storage-paths';

// Re-export atomic file operations
export {
  readValidatedJSON,
  readJSON,
  writeAtomicJSON,
  lockedRead,
  lockedWrite,
  lockedUpdate,
  lockedUpsert,
  listJSONFiles,
  removeFile,
  generateId,
  ValidationError,
} from './fs-atomic';

// Re-export file locking
export { acquireLock, tryAcquireLock, withLock, withLockAsync, type FileLock } from './file-lock';

// Legacy compat aliases
import { readJSON, writeAtomicJSON as _writeAtomicJSON } from './fs-atomic';
import { getProjectStorageDir as _getProjectStorageDir } from './storage-paths';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../types/index';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeReadJSONSync(filePath: string): any {
  return readJSON(filePath);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeReadJSON(filePath: string): Promise<any> {
  return readJSON(filePath);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function writeJSONSync(filePath: string, data: any): void {
  _writeAtomicJSON(filePath, data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeJSON(filePath: string, data: any): Promise<void> {
  _writeAtomicJSON(filePath, data);
}

export function readDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function removeDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function getPluginDir(): string {
  return _getProjectStorageDir();
}

export function getAppConfig(): AppConfig {
  const configPath = join(_getProjectStorageDir(), 'config.json');
  try {
    if (existsSync(configPath)) {
      return readJSON(configPath) as AppConfig;
    }
  } catch {
    // fall through
  }
  return {
    tmux: {
      enabled: true,
      layout: 'tiled',
      autoCleanup: true,
    },
  };
}
