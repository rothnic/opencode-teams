/**
 * Type definitions for OpenCode Teams Plugin
 *
 * Re-exports Zod-derived types from schemas.ts for backward compatibility.
 * All types are now defined via Zod schemas for runtime validation.
 */

export type {
  AgentState,
  AgentStatus,
  CLIConfig,
  DispatchAction,
  DispatchCondition,
  DispatchEvent,
  DispatchEventType,
  DispatchLogEntry,
  DispatchRule,
  HeartbeatRecord,
  HeartbeatSource,
  Inbox,
  LeaderInfo,
  Message,
  MessageType,
  PaneInfo,
  RoleDefinition,
  ServerInfo,
  SessionMetadata,
  ShutdownPhase,
  ShutdownRequest,
  Task,
  TaskCreateInput,
  TaskFilters,
  TaskStatus,
  TaskUpdateInput,
  TeamConfig,
  TeamMember,
  TeamSummary,
  TeamTemplate,
  TopologyType,
  WorkflowConfig,
} from './schemas';

export {
  AgentStateSchema,
  AgentStatusSchema,
  CLIConfigSchema,
  DispatchActionSchema,
  DispatchConditionSchema,
  DispatchEventSchema,
  DispatchEventTypeSchema,
  DispatchLogEntrySchema,
  DispatchRuleSchema,
  HeartbeatRecordSchema,
  HeartbeatSourceSchema,
  InboxSchema,
  LeaderInfoSchema,
  MessageSchema,
  MessageTypeSchema,
  PaneInfoSchema,
  RoleDefinitionSchema,
  ServerInfoSchema,
  SessionMetadataSchema,
  ShutdownPhaseSchema,
  ShutdownRequestSchema,
  TaskCreateInputSchema,
  TaskFiltersSchema,
  TaskSchema,
  TaskStatusSchema,
  TaskUpdateInputSchema,
  TeamConfigSchema,
  TeamMemberSchema,
  TeamSummarySchema,
  TeamTemplateSchema,
  TopologyTypeSchema,
  WorkflowConfigSchema,
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
