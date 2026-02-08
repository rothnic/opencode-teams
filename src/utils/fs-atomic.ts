/**
 * Atomic File Operations with Zod Validation
 *
 * Provides write-temp-then-rename atomic writes and Zod-validated JSON reads.
 * All read/write operations validate data against Zod schemas to ensure
 * data integrity on disk. Combined with file-lock.ts, this provides the
 * full concurrency-safe storage layer.
 */

import { join, dirname, basename } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import type { ZodType, ZodError } from 'zod';
import { acquireLock } from './file-lock';

/**
 * Error thrown when JSON validation fails against a Zod schema.
 */
export class ValidationError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly zodError: ZodError
  ) {
    const issues = zodError.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    super(`Validation failed for ${filePath}:\n${issues}`);
    this.name = 'ValidationError';
  }
}

/**
 * Read a JSON file and validate it against a Zod schema.
 *
 * @param filePath - Path to the JSON file
 * @param schema - Zod schema to validate against
 * @returns The parsed and validated data
 * @throws ValidationError if the data doesn't match the schema
 * @throws Error if the file doesn't exist or contains invalid JSON
 */
export function readValidatedJSON<S extends ZodType>(filePath: string, schema: S): S['_output'] {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read file ${filePath}: ${message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ValidationError(filePath, result.error);
  }

  return result.data;
}

/**
 * Read a JSON file without schema validation. Returns the raw parsed value.
 * Use this only for backward compatibility; prefer readValidatedJSON.
 */
export function readJSON(filePath: string): unknown {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }
}

/**
 * Write data atomically to a JSON file using write-temp-then-rename.
 *
 * If a schema is provided, the data is validated before writing.
 * The write follows this sequence:
 * 1. Validate data against schema (if provided)
 * 2. Serialize to JSON
 * 3. Write to a temp file in the same directory
 * 4. Rename temp file to target path (atomic on POSIX)
 *
 * This ensures the target file is never in a partially-written state.
 *
 * @param filePath - Target file path
 * @param data - Data to write
 * @param schema - Optional Zod schema to validate against before writing
 */
export function writeAtomicJSON(filePath: string, data: unknown, schema?: ZodType): void {
  // Validate before writing if schema is provided
  if (schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
      throw new ValidationError(filePath, result.error);
    }
  }

  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Generate temp file name in the same directory (required for atomic rename)
  const tempPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

  try {
    // Write to temp file
    writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');

    // Atomic rename
    renameSync(tempPath, filePath);
  } catch (err: unknown) {
    // Clean up temp file on failure
    try {
      if (existsSync(tempPath)) {
        unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write ${filePath}: ${message}`);
  }
}

/**
 * Read a file under an advisory lock with schema validation.
 *
 * @param lockPath - Path to the lock file
 * @param filePath - Path to the JSON file to read
 * @param schema - Zod schema to validate against
 * @returns The parsed and validated data
 */
export function lockedRead<S extends ZodType>(
  lockPath: string,
  filePath: string,
  schema: S
): S['_output'] {
  const lock = acquireLock(lockPath, false); // shared lock for reads
  try {
    return readValidatedJSON(filePath, schema);
  } finally {
    lock.release();
  }
}

/**
 * Write a file under an advisory lock with atomic write and optional validation.
 *
 * @param lockPath - Path to the lock file
 * @param filePath - Path to the JSON file to write
 * @param data - Data to write
 * @param schema - Optional Zod schema to validate against
 */
export function lockedWrite(
  lockPath: string,
  filePath: string,
  data: unknown,
  schema?: ZodType
): void {
  const lock = acquireLock(lockPath, true); // exclusive lock for writes
  try {
    writeAtomicJSON(filePath, data, schema);
  } finally {
    lock.release();
  }
}

/**
 * Locked read-modify-write cycle.
 *
 * Acquires an exclusive lock, reads the file, applies the update function,
 * validates the result, and writes it back atomically.
 *
 * @param lockPath - Path to the lock file
 * @param filePath - Path to the JSON file
 * @param schema - Zod schema for validation
 * @param updateFn - Function that takes the current data and returns updated data
 * @returns The updated data
 */
export function lockedUpdate<T>(
  lockPath: string,
  filePath: string,
  schema: ZodType<T>,
  updateFn: (current: T) => T
): T {
  const lock = acquireLock(lockPath, true); // exclusive lock
  try {
    const current = readValidatedJSON(filePath, schema);
    const updated = updateFn(current);
    writeAtomicJSON(filePath, updated, schema);
    return updated;
  } finally {
    lock.release();
  }
}

/**
 * Locked read-modify-write cycle that creates the file if it doesn't exist.
 *
 * @param lockPath - Path to the lock file
 * @param filePath - Path to the JSON file
 * @param schema - Zod schema for validation
 * @param defaultValue - Default value if file doesn't exist
 * @param updateFn - Function that takes the current data and returns updated data
 * @returns The updated data
 */
export function lockedUpsert<T>(
  lockPath: string,
  filePath: string,
  schema: ZodType<T>,
  defaultValue: T,
  updateFn: (current: T) => T
): T {
  const lock = acquireLock(lockPath, true);
  try {
    let current: T;
    if (existsSync(filePath)) {
      current = readValidatedJSON(filePath, schema);
    } else {
      current = defaultValue;
    }
    const updated = updateFn(current);
    writeAtomicJSON(filePath, updated, schema);
    return updated;
  } finally {
    lock.release();
  }
}

/**
 * List JSON files in a directory.
 */
export function listJSONFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  try {
    return readdirSync(dirPath)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Remove a file if it exists (no-op if it doesn't).
 */
export function removeFile(filePath: string): boolean {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Generate a unique ID using Web Crypto API.
 * Format: <timestamp>-<random-hex>
 */
export function generateId(): string {
  const randomBytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${Date.now()}-${randomHex}`;
}
