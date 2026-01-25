/**
 * Utility functions for OpenCode Teams Plugin
 * Using Bun built-in APIs instead of Node.js
 */

import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Safely read and parse a JSON file using Bun.file
 */
export async function safeReadJSON(filePath: string): Promise<any> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      throw new Error(`File not found: ${filePath}`);
    }

    return await file.json();
  } catch (error: any) {
    if (error.message?.includes('File not found')) {
      throw error;
    }
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }
}

/**
 * Safely read and parse a JSON file synchronously using Bun.file
 */
export function safeReadJSONSync(filePath: string): any {
  try {
    const file = Bun.file(filePath);
    const content = file.text();

    return JSON.parse(content as any);
  } catch (error: any) {
    if (error.code === 'ENOENT' || error.message?.includes('No such file')) {
      throw new Error(`File not found: ${filePath}`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Write JSON to a file using Bun.write
 */
export async function writeJSON(filePath: string, data: any): Promise<void> {
  await Bun.write(filePath, JSON.stringify(data, null, 2));
}

/**
 * Write JSON to a file synchronously
 */
export function writeJSONSync(filePath: string, data: any): void {
  Bun.write(filePath, JSON.stringify(data, null, 2));
}

/**
 * Generate a unique ID using Web Crypto API
 */
export function generateId(): string {
  const randomBytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${Date.now()}-${randomHex}`;
}

/**
 * Get the plugin's base directory in OpenCode config
 */
export function getPluginDir(): string {
  const baseDir =
    process.env.OPENCODE_TEAMS_DIR || join(homedir(), '.config', 'opencode', 'opencode-teams');

  // Use Bun's synchronous file operations
  if (!dirExists(baseDir)) {
    Bun.spawnSync(['mkdir', '-p', baseDir]);
  }

  return baseDir;
}

/**
 * Get the teams directory path
 */
export function getTeamsDir(): string {
  const baseDir = join(getPluginDir(), 'teams');

  if (!dirExists(baseDir)) {
    Bun.spawnSync(['mkdir', '-p', baseDir]);
  }

  return baseDir;
}

/**
 * Get the tasks directory path
 */
export function getTasksDir(): string {
  const baseDir = join(getPluginDir(), 'tasks');

  if (!dirExists(baseDir)) {
    Bun.spawnSync(['mkdir', '-p', baseDir]);
  }

  return baseDir;
}

/**
 * Check if a directory or file exists
 */
export function dirExists(path: string): boolean {
  try {
    const proc = Bun.spawnSync(['test', '-e', path]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Read directory contents
 */
export function readDir(path: string): string[] {
  try {
    const proc = Bun.spawnSync(['ls', '-1', path]);
    if (proc.exitCode !== 0) {
      return [];
    }
    const output = proc.stdout.toString().trim();
    return output ? output.split('\n') : [];
  } catch {
    return [];
  }
}

/**
 * Remove directory recursively
 */
export function removeDir(path: string): void {
  Bun.spawnSync(['rm', '-rf', path]);
}
