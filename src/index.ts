/**
 * OpenCode Teams Plugin
 *
 * Multi-agent team coordination plugin inspired by Claude Code's TeammateTool.
 * Enables spawning, coordinating, and managing teams of AI agents working together.
 *
 * Refactored to use Bun built-in APIs and modular structure.
 */

// Export operations
export { TeamOperations } from './operations/team';
export { TaskOperations } from './operations/task';

// Export types
export type {
  TeamConfig,
  TeamMember,
  LeaderInfo,
  Message,
  Task,
  TeamSummary,
  TaskFilters,
  JoinResult,
} from './types/index';

// Import for plugin initialization
import { TeamOperations } from './operations/team';
import { TaskOperations } from './operations/task';

/**
 * Main plugin export
 */
export default async (_context: any) => {
  console.log('[OpenCode Teams Plugin] Initialized');

  // Make operations available globally for skills to use
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).TeamOperations = TeamOperations;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).TaskOperations = TaskOperations;

  return {
    // Hook into tool execution to provide team context
    'tool.execute.before': async (_input: any, _output: any) => {
      // Inject team context if available
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Executing in team context: ${teamName}`);
      }
    },

    // Hook into session creation to set up team context
    'session.created': async (_event: any) => {
      console.log('[OpenCode Teams] New session created - team coordination available');
    },

    // Hook into session cleanup
    'session.deleted': async (_event: any) => {
      const teamName = process.env.OPENCODE_TEAM_NAME;
      if (teamName) {
        console.log(`[OpenCode Teams] Session ended - team: ${teamName}`);
      }
    },
  };
};
