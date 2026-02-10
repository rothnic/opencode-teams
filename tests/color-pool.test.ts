/**
 * Tests for src/utils/color-pool.ts
 *
 * Covers color allocation, release, schema validation, and edge cases.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { allocateColor, COLOR_PALETTE, ColorPoolSchema, releaseColor } from '../src/utils/color-pool';

describe('color-pool', () => {
  let tmpDir: string;
  let savedTeamsDir: string | undefined;
  let savedProjectRoot: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'oc-cp-'));
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

  // ── allocateColor ──────────────────────────────────────────────────────────

  describe('allocateColor()', () => {
    it('assigns first available color from palette', () => {
      const color = allocateColor('agent-1');
      expect(color).toBe(COLOR_PALETTE[0]);
    });

    it('successive allocations assign different colors', () => {
      const color1 = allocateColor('agent-1');
      const color2 = allocateColor('agent-2');
      const color3 = allocateColor('agent-3');

      expect(color1).not.toBe(color2);
      expect(color2).not.toBe(color3);
      expect(color1).not.toBe(color3);

      expect((COLOR_PALETTE as readonly string[]).includes(color1)).toBe(true);
      expect((COLOR_PALETTE as readonly string[]).includes(color2)).toBe(true);
      expect((COLOR_PALETTE as readonly string[]).includes(color3)).toBe(true);
    });

    it('is idempotent (same agent gets same color on re-call)', () => {
      const color1 = allocateColor('agent-1');
      const color2 = allocateColor('agent-1');
      const color3 = allocateColor('agent-1');

      expect(color1).toBe(color2);
      expect(color2).toBe(color3);
    });

    it('exhaustion fallback: when all 10 colors assigned, generates from hash', () => {
      // Allocate all 10 palette colors
      const agents = Array.from({ length: 10 }, (_, i) => `agent-${i}`);
      const colors = agents.map(agent => allocateColor(agent));

      // All colors should be from palette
      for (const color of colors) {
        expect((COLOR_PALETTE as readonly string[]).includes(color)).toBe(true);
      }

      // Next allocation should generate hash-based color
      const hashColor = allocateColor('agent-11');
      expect(hashColor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect((COLOR_PALETTE as readonly string[]).includes(hashColor)).toBe(false);
    });
  });

  // ── releaseColor ───────────────────────────────────────────────────────────

  describe('releaseColor()', () => {
    it('frees the color for reuse', () => {
      const color1 = allocateColor('agent-1');
      const color2 = allocateColor('agent-2');

      expect(color1).not.toBe(color2);

      releaseColor('agent-1');

      // Allocate new agent, should get the released color
      const color3 = allocateColor('agent-3');
      expect(color3).toBe(color1);
    });

    it('is idempotent (no error on releasing unassigned agent)', () => {
      // Should not throw
      expect(() => releaseColor('non-existent-agent')).not.toThrow();

      // Multiple releases should also not throw
      expect(() => releaseColor('non-existent-agent')).not.toThrow();
    });
  });

  // ── allocateColor + releaseColor integration ───────────────────────────────

  describe('allocateColor() + releaseColor()', () => {
    it('allocating after release reuses the released color', () => {
      const color1 = allocateColor('agent-1');
      const color2 = allocateColor('agent-2');

      expect(color1).not.toBe(color2);

      releaseColor('agent-1');
      const color3 = allocateColor('agent-3');

      expect(color3).toBe(color1);
    });
  });

  // ── ColorPoolSchema ────────────────────────────────────────────────────────

  describe('ColorPoolSchema', () => {
    it('validates correctly (valid inputs)', () => {
      const validPool = {
        assignments: {
          'agent-1': '#FF6B6B',
          'agent-2': '#4ECDC4',
        },
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      expect(() => ColorPoolSchema.parse(validPool)).not.toThrow();
      const parsed = ColorPoolSchema.parse(validPool);
      expect(parsed.assignments['agent-1']).toBe('#FF6B6B');
    });

    it('validates correctly (invalid inputs)', () => {
      const invalidPools = [
        // Invalid color format
        {
          assignments: { 'agent-1': 'invalid-color' },
          lastUpdated: '2025-01-01T00:00:00.000Z',
        },
        // Missing lastUpdated
        {
          assignments: { 'agent-1': '#FF6B6B' },
        },
        // Invalid lastUpdated format
        {
          assignments: { 'agent-1': '#FF6B6B' },
          lastUpdated: 'not-a-date',
        },
        // Non-object assignments
        {
          assignments: 'not-an-object',
          lastUpdated: '2025-01-01T00:00:00.000Z',
        },
      ];

      for (const invalidPool of invalidPools) {
        expect(() => ColorPoolSchema.parse(invalidPool)).toThrow();
      }
    });
  });
});