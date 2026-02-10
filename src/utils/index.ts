/**
 * Utility functions for OpenCode Teams Plugin
 *
 * Re-exports from the new modular utility files for backward compatibility.
 * New code should import directly from the specific modules.
 */

export type { ColorPool } from './color-pool';
// Re-export color pool
export { allocateColor, COLOR_PALETTE, ColorPoolSchema, releaseColor } from './color-pool';
// Re-export file locking
export { acquireLock, type FileLock, tryAcquireLock, withLock, withLockAsync } from './file-lock';
// Re-export atomic file operations
export {
  generateId,
  listJSONFiles,
  lockedRead,
  lockedUpdate,
  lockedUpsert,
  lockedWrite,
  readJSON,
  readValidatedJSON,
  removeFile,
  ValidationError,
  writeAtomicJSON,
} from './fs-atomic';
// Re-export storage path utilities
export {
  detectProjectRoot,
  dirExists,
  ensureDir,
  fileExists,
  getAgentInboxPath,
  getAgentLockPath,
  getAgentStatePath,
  getAgentsDir,
  getColorPoolPath,
  getGlobalConfigDir,
  getInboxesDir,
  getProjectStorageDir,
  getServerLogPath,
  getServerStatePath,
  getServersDir,
  getSessionMetadataPath,
  getSessionsDir,
  getTaskLockPath,
  getTasksDir,
  getTeamConfigPath,
  getTeamDir,
  getTeamLockPath,
  getTeamsDir,
  getTeamTasksDir,
  getTemplatesDir,
} from './storage-paths';

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { AppConfig } from '../types/index';
// Legacy compat aliases
import { writeAtomicJSON as _writeAtomicJSON, readJSON } from './fs-atomic';
import { getProjectStorageDir as _getProjectStorageDir } from './storage-paths';

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
