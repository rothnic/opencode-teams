/**
 * Type definitions for OpenCode Teams Plugin
 *
 * Re-exports Zod-derived types from schemas.ts for backward compatibility.
 * All types are now defined via Zod schemas for runtime validation.
 */

export type {
  TeamMember,
  TeamConfig,
  Message,
  Task,
  TaskStatus,
  TaskFilters,
  TeamSummary,
  LeaderInfo,
  TaskCreateInput,
  TaskUpdateInput,
  Inbox,
} from './schemas';

export {
  TeamMemberSchema,
  TeamConfigSchema,
  MessageSchema,
  TaskSchema,
  TaskStatusSchema,
  TaskFiltersSchema,
  TeamSummarySchema,
  LeaderInfoSchema,
  InboxSchema,
  TaskCreateInputSchema,
  TaskUpdateInputSchema,
} from './schemas';

// Legacy types that are not schema-backed (kept for backward compat)

export interface JoinResult {
  success: boolean;
  team: string;
}

export interface TmuxConfig {
  enabled?: boolean;
  layout?: string;
  mainPaneSize?: number;
  autoCleanup?: boolean;
}

export interface AppConfig {
  tmux?: TmuxConfig;
}
