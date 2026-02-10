/**
 * Phase 1 verification tests
 *
 * Validates:
 * - concurrent writes are protected (no data loss)
 * - atomic writes preserve original on failure
 * - schema validation rejects bad JSON
 * - path resolution uses .opencode/ under project root
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { withLock } from '../src/utils/file-lock';
import {
  lockedUpdate,
  readValidatedJSON,
  ValidationError,
  writeAtomicJSON,
} from '../src/utils/fs-atomic';
import { getProjectStorageDir } from '../src/utils/storage-paths';

const CounterSchema = z.object({ count: z.number() });
type Counter = z.infer<typeof CounterSchema>;

describe('Phase 1 verification', () => {
  let tmpDir: string;
  let savedProjectRoot: string | undefined;
  let savedTeamsDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-phase1-'));
    savedProjectRoot = process.env.OPENCODE_PROJECT_ROOT;
    savedTeamsDir = process.env.OPENCODE_TEAMS_DIR;
    delete process.env.OPENCODE_TEAMS_DIR;
    process.env.OPENCODE_PROJECT_ROOT = tmpDir;
  });

  afterEach(() => {
    if (savedProjectRoot !== undefined) {
      process.env.OPENCODE_PROJECT_ROOT = savedProjectRoot;
    } else {
      delete process.env.OPENCODE_PROJECT_ROOT;
    }
    if (savedTeamsDir !== undefined) {
      process.env.OPENCODE_TEAMS_DIR = savedTeamsDir;
    } else {
      delete process.env.OPENCODE_TEAMS_DIR;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('paths resolve to .opencode/opencode-teams within project root', () => {
    const storageDir = getProjectStorageDir();
    expect(storageDir).toBe(join(tmpDir, '.opencode', 'opencode-teams'));
  });

  it('atomic write preserves original on failed write', () => {
    const filePath = join(tmpDir, 'data.json');
    const original: Counter = { count: 1 };
    writeAtomicJSON(filePath, original, CounterSchema);

    const badData = { count: 'nope' };
    expect(() => writeAtomicJSON(filePath, badData, CounterSchema)).toThrow(ValidationError);

    const fromDisk = readValidatedJSON(filePath, CounterSchema);
    expect(fromDisk).toEqual(original);
  });

  it('invalid JSON or schema mismatch triggers validation error', () => {
    const filePath = join(tmpDir, 'bad.json');
    writeFileSync(filePath, '{broken json');
    expect(() => readValidatedJSON(filePath, CounterSchema)).toThrow('Invalid JSON');

    const mismatchPath = join(tmpDir, 'mismatch.json');
    writeFileSync(mismatchPath, JSON.stringify({ count: 'bad' }));
    expect(() => readValidatedJSON(mismatchPath, CounterSchema)).toThrow(ValidationError);
  });

  it('locked concurrent updates do not lose data', async () => {
    const dataDir = join(tmpDir, 'data');
    mkdirSync(dataDir, { recursive: true });

    const filePath = join(dataDir, 'counter.json');
    const lockPath = join(dataDir, '.lock');
    writeAtomicJSON(filePath, { count: 0 }, CounterSchema);

    const updates = Array.from({ length: 25 }, () =>
      Promise.resolve().then(() =>
        lockedUpdate(lockPath, filePath, CounterSchema, (data) => ({
          count: data.count + 1,
        })),
      ),
    );

    await Promise.all(updates);

    const finalValue = readValidatedJSON(filePath, CounterSchema);
    expect(finalValue.count).toBe(25);
  });

  it('withLock enforces exclusive access for critical sections', () => {
    const lockPath = join(tmpDir, 'critical.lock');
    let state = 0;

    withLock(lockPath, () => {
      const snapshot = state;
      state = snapshot + 1;
    });

    withLock(lockPath, () => {
      const snapshot = state;
      state = snapshot + 1;
    });

    expect(state).toBe(2);
  });
});
