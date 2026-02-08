/**
 * Tests for src/utils/fs-atomic.ts
 *
 * Covers atomic JSON writes, schema-validated reads, locked updates/upserts,
 * directory listing, file removal, and ID generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { z } from 'zod';

import {
  ValidationError,
  writeAtomicJSON,
  readValidatedJSON,
  readJSON,
  lockedUpdate,
  lockedUpsert,
  listJSONFiles,
  removeFile,
  generateId,
} from '../src/utils/fs-atomic';

// ── Test schemas ─────────────────────────────────────────────────────────

const TestSchema = z.object({ name: z.string(), value: z.number() });
type TestData = z.infer<typeof TestSchema>;

const CounterSchema = z.object({ count: z.number() });
type _CounterData = z.infer<typeof CounterSchema>;

describe('fs-atomic', () => {
  let tmpDir: string;
  let savedTeamsDir: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-teams-fa-'));
    savedTeamsDir = process.env.OPENCODE_TEAMS_DIR;
    process.env.OPENCODE_TEAMS_DIR = join(tmpDir, 'storage');
  });

  afterEach(() => {
    if (savedTeamsDir !== undefined) {
      process.env.OPENCODE_TEAMS_DIR = savedTeamsDir;
    } else {
      delete process.env.OPENCODE_TEAMS_DIR;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── writeAtomicJSON ────────────────────────────────────────────────────

  describe('writeAtomicJSON()', () => {
    it('writes valid JSON that can be read back', () => {
      const filePath = join(tmpDir, 'data.json');
      const data: TestData = { name: 'hello', value: 42 };

      writeAtomicJSON(filePath, data);

      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed).toEqual(data);
    });

    it('creates parent directories if needed', () => {
      const filePath = join(tmpDir, 'a', 'b', 'c', 'nested.json');
      writeAtomicJSON(filePath, { name: 'nested', value: 1 });

      const raw = readFileSync(filePath, 'utf8');
      expect(JSON.parse(raw)).toEqual({ name: 'nested', value: 1 });
    });

    it('with schema rejects invalid data and throws ValidationError', () => {
      const filePath = join(tmpDir, 'bad.json');
      const invalidData = { name: 123, value: 'not-a-number' };

      expect(() => {
        writeAtomicJSON(filePath, invalidData, TestSchema as z.ZodType<any>);
      }).toThrow(ValidationError);
    });

    it('with schema accepts valid data', () => {
      const filePath = join(tmpDir, 'valid.json');
      const data: TestData = { name: 'ok', value: 99 };

      // Should not throw
      writeAtomicJSON(filePath, data, TestSchema);

      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed).toEqual(data);
    });

    it('does not leave temp files on success', () => {
      const filePath = join(tmpDir, 'clean.json');
      writeAtomicJSON(filePath, { name: 'clean', value: 0 });

      const files = readdirSync(tmpDir);
      const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });

    it('preserves original file on schema validation failure', () => {
      const filePath = join(tmpDir, 'orig.json');
      const original: TestData = { name: 'original', value: 1 };
      writeAtomicJSON(filePath, original, TestSchema);

      // Attempt an invalid write with schema
      const bad = { name: 999, value: 'bad' };
      try {
        writeAtomicJSON(filePath, bad, TestSchema as z.ZodType<any>);
      } catch {
        // expected
      }

      // Original should be intact
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(parsed).toEqual(original);
    });

    it('writes pretty-printed JSON (2-space indent)', () => {
      const filePath = join(tmpDir, 'pretty.json');
      writeAtomicJSON(filePath, { name: 'fmt', value: 7 });

      const raw = readFileSync(filePath, 'utf8');
      expect(raw).toContain('\n');
      expect(raw).toBe(JSON.stringify({ name: 'fmt', value: 7 }, null, 2));
    });
  });

  // ── readValidatedJSON ──────────────────────────────────────────────────

  describe('readValidatedJSON()', () => {
    it('reads and validates JSON against a Zod schema', () => {
      const filePath = join(tmpDir, 'read-valid.json');
      writeFileSync(filePath, JSON.stringify({ name: 'test', value: 42 }));

      const result = readValidatedJSON(filePath, TestSchema);
      expect(result).toEqual({ name: 'test', value: 42 });
    });

    it('throws ValidationError for schema-mismatched data', () => {
      const filePath = join(tmpDir, 'read-mismatch.json');
      writeFileSync(filePath, JSON.stringify({ name: 123, value: 'bad' }));

      expect(() => readValidatedJSON(filePath, TestSchema)).toThrow(ValidationError);
    });

    it('throws for missing file', () => {
      const filePath = join(tmpDir, 'does-not-exist.json');

      expect(() => readValidatedJSON(filePath, TestSchema)).toThrow('File not found');
    });

    it('throws for invalid JSON content', () => {
      const filePath = join(tmpDir, 'bad-json.json');
      writeFileSync(filePath, '{not valid json!!!');

      expect(() => readValidatedJSON(filePath, TestSchema)).toThrow('Invalid JSON');
    });

    it('returns the Zod-transformed data', () => {
      const SchemaWithDefault = z.object({
        name: z.string(),
        active: z.boolean().default(true),
      });
      const filePath = join(tmpDir, 'defaults.json');
      writeFileSync(filePath, JSON.stringify({ name: 'test' }));

      const result = readValidatedJSON(filePath, SchemaWithDefault);
      expect(result.active).toBe(true);
    });
  });

  // ── readJSON ───────────────────────────────────────────────────────────

  describe('readJSON()', () => {
    it('reads JSON without validation', () => {
      const filePath = join(tmpDir, 'raw.json');
      writeFileSync(filePath, JSON.stringify({ arbitrary: 'data', count: 5 }));

      const result = readJSON(filePath);
      expect(result).toEqual({ arbitrary: 'data', count: 5 });
    });

    it('throws for missing file', () => {
      expect(() => readJSON(join(tmpDir, 'missing.json'))).toThrow('File not found');
    });

    it('throws for invalid JSON', () => {
      const filePath = join(tmpDir, 'broken.json');
      writeFileSync(filePath, 'not json');

      expect(() => readJSON(filePath)).toThrow('Invalid JSON');
    });

    it('handles arrays', () => {
      const filePath = join(tmpDir, 'arr.json');
      writeFileSync(filePath, JSON.stringify([1, 2, 3]));

      const result = readJSON(filePath);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  // ── lockedUpdate ───────────────────────────────────────────────────────

  describe('lockedUpdate()', () => {
    it('performs atomic read-modify-write', () => {
      const filePath = join(tmpDir, 'counter.json');
      const lockPath = join(tmpDir, 'counter.lock');

      // Write initial data
      writeAtomicJSON(filePath, { count: 0 }, CounterSchema);

      // Update: increment counter
      const result = lockedUpdate(lockPath, filePath, CounterSchema, (data) => ({
        count: data.count + 1,
      }));

      expect(result).toEqual({ count: 1 });

      // Verify on disk
      const fromDisk = readValidatedJSON(filePath, CounterSchema);
      expect(fromDisk).toEqual({ count: 1 });
    });

    it('applies multiple sequential updates correctly', () => {
      const filePath = join(tmpDir, 'multi.json');
      const lockPath = join(tmpDir, 'multi.lock');

      writeAtomicJSON(filePath, { count: 0 }, CounterSchema);

      for (let i = 0; i < 5; i++) {
        lockedUpdate(lockPath, filePath, CounterSchema, (data) => ({
          count: data.count + 1,
        }));
      }

      const result = readValidatedJSON(filePath, CounterSchema);
      expect(result.count).toBe(5);
    });
  });

  // ── lockedUpsert ───────────────────────────────────────────────────────

  describe('lockedUpsert()', () => {
    it('creates the file if it does not exist', () => {
      const filePath = join(tmpDir, 'upsert-new.json');
      const lockPath = join(tmpDir, 'upsert-new.lock');

      const result = lockedUpsert(lockPath, filePath, CounterSchema, { count: 0 }, (data) => ({
        count: data.count + 10,
      }));

      expect(result).toEqual({ count: 10 });

      const fromDisk = readValidatedJSON(filePath, CounterSchema);
      expect(fromDisk).toEqual({ count: 10 });
    });

    it('updates existing file', () => {
      const filePath = join(tmpDir, 'upsert-existing.json');
      const lockPath = join(tmpDir, 'upsert-existing.lock');

      writeAtomicJSON(filePath, { count: 5 }, CounterSchema);

      const result = lockedUpsert(lockPath, filePath, CounterSchema, { count: 0 }, (data) => ({
        count: data.count + 3,
      }));

      expect(result).toEqual({ count: 8 });
    });

    it('uses defaultValue for non-existent file', () => {
      const filePath = join(tmpDir, 'upsert-default.json');
      const lockPath = join(tmpDir, 'upsert-default.lock');

      const result = lockedUpsert(
        lockPath,
        filePath,
        CounterSchema,
        { count: 100 },
        (data) => data
      );

      expect(result).toEqual({ count: 100 });
    });
  });

  // ── listJSONFiles ──────────────────────────────────────────────────────

  describe('listJSONFiles()', () => {
    it('lists only .json files', () => {
      const dir = join(tmpDir, 'listing');
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, 'a.json'), '{}');
      writeFileSync(join(dir, 'b.json'), '{}');
      writeFileSync(join(dir, 'c.txt'), 'text');
      writeFileSync(join(dir, 'readme.md'), '# hi');

      const files = listJSONFiles(dir);
      expect(files).toEqual(['a.json', 'b.json']);
    });

    it('returns sorted results', () => {
      const dir = join(tmpDir, 'sorted');
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, 'zeta.json'), '{}');
      writeFileSync(join(dir, 'alpha.json'), '{}');
      writeFileSync(join(dir, 'mid.json'), '{}');

      const files = listJSONFiles(dir);
      expect(files).toEqual(['alpha.json', 'mid.json', 'zeta.json']);
    });

    it('returns empty array for non-existent directory', () => {
      const files = listJSONFiles(join(tmpDir, 'nope'));
      expect(files).toEqual([]);
    });

    it('excludes hidden (dot-prefixed) .json files', () => {
      const dir = join(tmpDir, 'hidden');
      mkdirSync(dir, { recursive: true });

      writeFileSync(join(dir, '.hidden.json'), '{}');
      writeFileSync(join(dir, 'visible.json'), '{}');

      const files = listJSONFiles(dir);
      expect(files).toEqual(['visible.json']);
    });

    it('returns empty array for empty directory', () => {
      const dir = join(tmpDir, 'empty-dir');
      mkdirSync(dir, { recursive: true });

      const files = listJSONFiles(dir);
      expect(files).toEqual([]);
    });
  });

  // ── removeFile ─────────────────────────────────────────────────────────

  describe('removeFile()', () => {
    it('removes an existing file and returns true', () => {
      const filePath = join(tmpDir, 'to-remove.json');
      writeFileSync(filePath, '{}');

      const result = removeFile(filePath);
      expect(result).toBe(true);

      // File should be gone
      expect(() => readFileSync(filePath)).toThrow();
    });

    it('returns false for a non-existent file', () => {
      const result = removeFile(join(tmpDir, 'no-such-file.json'));
      expect(result).toBe(false);
    });

    it('returns false when called twice on same file', () => {
      const filePath = join(tmpDir, 'double-remove.json');
      writeFileSync(filePath, '{}');

      expect(removeFile(filePath)).toBe(true);
      expect(removeFile(filePath)).toBe(false);
    });
  });

  // ── generateId ─────────────────────────────────────────────────────────

  describe('generateId()', () => {
    it('returns a string in timestamp-hex format', () => {
      const id = generateId();
      expect(id).toMatch(/^\d+-[a-f0-9]{8}$/);
    });

    it('returns unique IDs on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      // All 100 should be unique
      expect(ids.size).toBe(100);
    });

    it('timestamp portion is a valid recent timestamp', () => {
      const before = Date.now();
      const id = generateId();
      const after = Date.now();

      const timestamp = parseInt(id.split('-')[0], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('hex portion is exactly 8 characters', () => {
      const id = generateId();
      const hex = id.split('-')[1];
      expect(hex).toHaveLength(8);
      expect(hex).toMatch(/^[a-f0-9]+$/);
    });
  });
});
