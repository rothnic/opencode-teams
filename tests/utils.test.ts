/**
 * Unit tests for utility functions
 * Using Bun's built-in test runner
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { generateId, dirExists, getPluginDir, getTeamsDir, getTasksDir } from '../src/utils/index';
import { join } from 'node:path';

describe('Utility Functions', () => {
  describe('generateId', () => {
    it('should generate a unique ID', () => {
      const id1 = generateId();
      const id2 = generateId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-f0-9]{8}$/);
    });

    it('should include timestamp and random hex', () => {
      const id = generateId();
      const parts = id.split('-');
      
      expect(parts).toHaveLength(2);
      expect(parseInt(parts[0])).toBeGreaterThan(0);
      expect(parts[1]).toMatch(/^[a-f0-9]{8}$/);
    });
  });

  describe('dirExists', () => {
    it('should return true for existing directory', () => {
      const result = dirExists('/tmp');
      expect(result).toBe(true);
    });

    it('should return false for non-existing directory', () => {
      const result = dirExists('/tmp/nonexistent-dir-' + Date.now());
      expect(result).toBe(false);
    });
  });

  describe('Directory helpers', () => {
    beforeAll(() => {
      // Set up test environment
      process.env.OPENCODE_TEAMS_DIR = `/tmp/opencode-teams-test-${Date.now()}`;
    });

    afterAll(() => {
      // Clean up test directory
      const testDir = process.env.OPENCODE_TEAMS_DIR;
      if (testDir && testDir.startsWith('/tmp/opencode-teams-test-')) {
        Bun.spawnSync(['rm', '-rf', testDir]);
      }
      delete process.env.OPENCODE_TEAMS_DIR;
    });

    it('should create and return plugin directory', () => {
      const pluginDir = getPluginDir();
      
      expect(pluginDir).toBeDefined();
      expect(dirExists(pluginDir)).toBe(true);
    });

    it('should create and return teams directory', () => {
      const teamsDir = getTeamsDir();
      const pluginDir = getPluginDir();
      
      expect(teamsDir).toBe(join(pluginDir, 'teams'));
      expect(dirExists(teamsDir)).toBe(true);
    });

    it('should create and return tasks directory', () => {
      const tasksDir = getTasksDir();
      const pluginDir = getPluginDir();
      
      expect(tasksDir).toBe(join(pluginDir, 'tasks'));
      expect(dirExists(tasksDir)).toBe(true);
    });
  });
});
