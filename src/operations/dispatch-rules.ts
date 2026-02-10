/**
 * Dispatch Rules Operations Module
 *
 * Manages event-driven dispatch rules and logs for teams.
 * Uses file-lock and atomic writes for concurrency safety.
 */

import {
  type DispatchLogEntry,
  type DispatchRule,
  DispatchRuleSchema,
  type TeamConfig,
  TeamConfigSchema,
} from '../types/schemas';
import { withLock } from '../utils/file-lock';
import { lockedUpdate, readValidatedJSON } from '../utils/fs-atomic';
import { fileExists, getTeamConfigPath, getTeamLockPath } from '../utils/storage-paths';

export const DispatchRuleOperations = {
  /**
   * Add a new dispatch rule to a team
   */
  addDispatchRule: (teamName: string, rule: DispatchRule): TeamConfig => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    // Validate rule schema
    DispatchRuleSchema.parse(rule);

    return lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      // Check for duplicate rule ID
      if (config.dispatchRules.some((r) => r.id === rule.id)) {
        throw new Error(`Dispatch rule with ID "${rule.id}" already exists`);
      }

      return {
        ...config,
        dispatchRules: [...config.dispatchRules, rule],
      };
    });
  },

  /**
   * Remove a dispatch rule from a team
   */
  removeDispatchRule: (teamName: string, ruleId: string): TeamConfig => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    return lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
      const ruleExists = config.dispatchRules.some((r) => r.id === ruleId);
      if (!ruleExists) {
        throw new Error(`Dispatch rule "${ruleId}" not found`);
      }

      return {
        ...config,
        dispatchRules: config.dispatchRules.filter((r) => r.id !== ruleId),
      };
    });
  },

  /**
   * List all dispatch rules for a team
   */
  listDispatchRules: (teamName: string): DispatchRule[] => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const config = withLock(lockPath, () => readValidatedJSON(configPath, TeamConfigSchema), false);
    return config.dispatchRules;
  },

  /**
   * Get dispatch log entries for a team
   */
  getDispatchLog: (teamName: string, limit?: number): DispatchLogEntry[] => {
    const configPath = getTeamConfigPath(teamName);
    const lockPath = getTeamLockPath(teamName);

    if (!fileExists(configPath)) {
      throw new Error(`Team "${teamName}" does not exist`);
    }

    const config = withLock(lockPath, () => readValidatedJSON(configPath, TeamConfigSchema), false);

    // Sort logs by timestamp descending (newest first)
    const sortedLogs = [...config.dispatchLog].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (limit && limit > 0) {
      return sortedLogs.slice(0, limit);
    }

    return sortedLogs;
  },
};
