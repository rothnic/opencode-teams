/**
 * Zod Schemas for OpenCode Teams Plugin
 *
 * Runtime-validated schemas for all shared state structures.
 * These schemas ensure data integrity when reading from and writing to disk.
 * Every JSON file on disk must pass through these schemas.
 */

import { z } from 'zod';

// ─── Team Member ───────────────────────────────────────────────────────────

export const TeamMemberSchema = z.object({
  agentId: z.string().min(1, 'agentId must be non-empty'),
  agentName: z.string().min(1, 'agentName must be non-empty'),
  agentType: z.string().min(1, 'agentType must be non-empty'),
  joinedAt: z.string().datetime({ message: 'joinedAt must be ISO 8601' }),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

// ─── Topology Type ─────────────────────────────────────────────────────────

export const TopologyTypeSchema = z.enum(['flat', 'hierarchical']);

export type TopologyType = z.infer<typeof TopologyTypeSchema>;

// ─── Role Definition ───────────────────────────────────────────────────────

export const RoleDefinitionSchema = z.object({
  name: z.string().min(1, 'Role name must be non-empty'),
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;

// ─── Workflow Config ───────────────────────────────────────────────────────

export const WorkflowConfigSchema = z.object({
  enabled: z.boolean().default(false),
  taskThreshold: z.number().int().positive().default(5),
  workerRatio: z.number().positive().default(3.0),
  cooldownSeconds: z.number().int().nonnegative().default(300),
  lastSuggestionAt: z.string().datetime().optional(),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// ─── Dispatch Event Types ──────────────────────────────────────────────────

export const DispatchEventTypeSchema = z.enum([
  'task.created',
  'task.completed',
  'task.unblocked',
  'agent.idle',
  'agent.active',
  'agent.terminated',
  'team.created',
  'session.idle',
]);

export type DispatchEventType = z.infer<typeof DispatchEventTypeSchema>;

// ─── Dispatch Event ────────────────────────────────────────────────────────

export const DispatchEventSchema = z.object({
  id: z.string().min(1, 'Event ID must be non-empty'),
  type: DispatchEventTypeSchema,
  teamName: z.string().min(1, 'Team name must be non-empty'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  payload: z.record(z.unknown()).default({}),
});

export type DispatchEvent = z.infer<typeof DispatchEventSchema>;

// ─── Dispatch Condition ────────────────────────────────────────────────────

export const DispatchConditionSchema = z.object({
  type: z.enum(['simple_match', 'resource_count']),
  field: z.string().optional(),
  resource: z.enum(['unblocked_tasks', 'active_agents']).optional(),
  operator: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export type DispatchCondition = z.infer<typeof DispatchConditionSchema>;

// ─── Dispatch Action ───────────────────────────────────────────────────────

export const DispatchActionSchema = z.object({
  type: z.enum(['assign_task', 'notify_leader', 'log']),
  params: z.record(z.unknown()).optional(),
});

export type DispatchAction = z.infer<typeof DispatchActionSchema>;

// ─── Dispatch Rule ─────────────────────────────────────────────────────────

export const DispatchRuleSchema = z.object({
  id: z.string().min(1, 'Rule ID must be non-empty'),
  eventType: DispatchEventTypeSchema,
  condition: DispatchConditionSchema.optional(),
  action: DispatchActionSchema,
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export type DispatchRule = z.infer<typeof DispatchRuleSchema>;

// ─── Dispatch Log Entry ────────────────────────────────────────────────────

export const DispatchLogEntrySchema = z.object({
  id: z.string().min(1, 'Log entry ID must be non-empty'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  ruleId: z.string().min(1),
  eventType: DispatchEventTypeSchema,
  success: z.boolean(),
  details: z.string().optional(),
  actionResult: z.unknown().optional(),
});

export type DispatchLogEntry = z.infer<typeof DispatchLogEntrySchema>;

// ─── Team Config ───────────────────────────────────────────────────────────

export const TeamConfigSchema = z.object({
  name: z
    .string()
    .min(1, 'Team name must be non-empty')
    .regex(/^[A-Za-z0-9_-]+$/, 'Team name must be alphanumeric with hyphens/underscores'),
  created: z.string().datetime({ message: 'created must be ISO 8601' }),
  leader: z.string().min(1, 'leader must be non-empty'),
  members: z.array(TeamMemberSchema).min(1, 'Team must have at least one member'),
  shutdownApprovals: z.array(z.string()).optional(),
  topology: TopologyTypeSchema.optional(),
  description: z.string().optional(),
  templateSource: z.string().optional(),
  roles: z.array(RoleDefinitionSchema).optional(),
  workflowConfig: WorkflowConfigSchema.optional(),
  dispatchRules: z.array(DispatchRuleSchema).default([]),
  dispatchLog: z.array(DispatchLogEntrySchema).default([]),
});

export type TeamConfig = z.infer<typeof TeamConfigSchema>;

// ─── Task Status ───────────────────────────────────────────────────────────

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ─── Task ──────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().min(1, 'Task ID must be non-empty'),
  title: z.string().default('Untitled Task'),
  description: z.string().optional(),
  priority: z.enum(['high', 'normal', 'low']).default('normal'),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: 'createdAt must be ISO 8601' }),
  updatedAt: z.string().datetime().optional(),
  owner: z.string().optional(),
  claimedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  dependencies: z.array(z.string()).default([]),
  blocks: z.array(z.string()).default([]),
  warning: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

// ─── Task Create Input (for creating new tasks) ───────────────────────────

export const TaskCreateInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  dependencies: z.array(z.string()).optional(),
});

export type TaskCreateInput = z.infer<typeof TaskCreateInputSchema>;

// ─── Task Update Input ─────────────────────────────────────────────────────

export const TaskUpdateInputSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    status: TaskStatusSchema.optional(),
    owner: z.string().optional(),
    claimedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    dependencies: z.array(z.string()).optional(),
    warning: z.string().optional(),
  })
  .strict();

export type TaskUpdateInput = z.infer<typeof TaskUpdateInputSchema>;

// ─── Message Type ───────────────────────────────────────────────────────────

export const MessageTypeSchema = z.enum([
  'plain',
  'idle',
  'task_assignment',
  'shutdown_request',
  'shutdown_approved',
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

// ─── Message ───────────────────────────────────────────────────────────────

export const MessageSchema = z.object({
  from: z.string().min(1, 'Sender must be non-empty'),
  to: z.string().min(1, 'Recipient must be non-empty'),
  message: z.string(),
  type: MessageTypeSchema.default('plain'),
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  read: z.boolean().default(false),
  summary: z.string().optional(),
  recipients: z.array(z.string()).optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// ─── Inbox (array of messages per agent) ───────────────────────────────────

export const InboxSchema = z.array(MessageSchema);

export type Inbox = z.infer<typeof InboxSchema>;

// ─── Team Summary (for discovery listings) ─────────────────────────────────

export const TeamSummarySchema = z.object({
  name: z.string(),
  leader: z.string(),
  memberCount: z.number().int().nonnegative(),
  created: z.string(),
});

export type TeamSummary = z.infer<typeof TeamSummarySchema>;

// ─── Task Filters ──────────────────────────────────────────────────────────

export const TaskFiltersSchema = z.object({
  status: TaskStatusSchema.optional(),
  owner: z.string().optional(),
});

export type TaskFilters = z.infer<typeof TaskFiltersSchema>;

// ─── Team Template ─────────────────────────────────────────────────────────

export const TeamTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Template name must be kebab-case'),
  description: z.string().optional(),
  topology: TopologyTypeSchema.default('flat'),
  roles: z.array(RoleDefinitionSchema).min(1, 'Template must define at least one role'),
  defaultTasks: z.array(TaskCreateInputSchema).optional(),
  workflowConfig: WorkflowConfigSchema.optional(),
  createdAt: z.string().datetime({ message: 'createdAt must be ISO 8601' }),
  updatedAt: z.string().datetime().optional(),
});

export type TeamTemplate = z.infer<typeof TeamTemplateSchema>;

// ─── Leader Info (for team creation) ───────────────────────────────────────

export const LeaderInfoSchema = z.object({
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  agentType: z.string().optional(),
});

export type LeaderInfo = z.infer<typeof LeaderInfoSchema>;

// ─── Agent Status ───────────────────────────────────────────────────────────

export const AgentStatusSchema = z.enum([
  'spawning', // Process started, not yet confirmed alive
  'active', // Running and heartbeating normally
  'idle', // Session idle event received, waiting for input
  'inactive', // Heartbeat timeout, presumed dead
  'shutting_down', // Graceful shutdown in progress
  'terminated', // Clean shutdown completed
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// ─── Agent State ────────────────────────────────────────────────────────────

export const AgentStateSchema = z.object({
  // Identity
  id: z.string().min(1, 'Agent ID must be non-empty'),
  name: z.string().min(1, 'Agent name must be non-empty'),
  teamName: z.string().min(1, 'Team name must be non-empty'),
  role: z.enum(['leader', 'worker', 'reviewer', 'task-manager']).default('worker'),

  // Model configuration
  model: z.string().min(1, 'Model identifier must be non-empty'),
  providerId: z.string().optional(),

  // Process linkage
  sessionId: z.string().min(1, 'Session ID must be non-empty'),
  paneId: z.string().optional(),
  serverPort: z.number().int().min(1024).max(65535),

  // Working context
  cwd: z.string().min(1, 'Working directory must be non-empty'),
  initialPrompt: z.string().optional(),

  // Visual identification
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be hex format (#RRGGBB)'),

  // Lifecycle state
  status: AgentStatusSchema,
  isActive: z.boolean(),

  // Timestamps (all ISO 8601)
  createdAt: z.string().datetime({ message: 'createdAt must be ISO 8601' }),
  heartbeatTs: z.string().datetime({ message: 'heartbeatTs must be ISO 8601' }),
  updatedAt: z.string().datetime().optional(),
  terminatedAt: z.string().datetime().optional(),

  // Error tracking
  consecutiveMisses: z.number().int().nonnegative().default(0),
  lastError: z.string().optional(),
  sessionRotationCount: z.number().int().nonnegative().default(0),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

// ─── Server Info ────────────────────────────────────────────────────────────

export const ServerInfoSchema = z.object({
  // Identity
  projectPath: z.string().min(1, 'Project path must be non-empty'),
  projectHash: z.string().min(1, 'Project hash must be non-empty'),

  // Process
  pid: z.number().int().positive(),
  port: z.number().int().min(28000).max(28999),
  hostname: z.string().default('127.0.0.1'),

  // State
  isRunning: z.boolean(),
  activeSessions: z.number().int().nonnegative().default(0),

  // Paths
  logPath: z.string().optional(),

  // Timestamps
  startedAt: z.string().datetime({ message: 'startedAt must be ISO 8601' }),
  lastHealthCheck: z.string().datetime().optional(),
});

export type ServerInfo = z.infer<typeof ServerInfoSchema>;

// ─── Heartbeat Record ───────────────────────────────────────────────────────

export const HeartbeatSourceSchema = z.enum([
  'tool', // Explicit heartbeat tool call by agent
  'sdk_session_idle', // SDK session.idle event
  'sdk_session_updated', // SDK session.updated event
  'sdk_tool_execute', // SDK tool.execute.after event
]);

export type HeartbeatSource = z.infer<typeof HeartbeatSourceSchema>;

export const HeartbeatRecordSchema = z.object({
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  source: HeartbeatSourceSchema,
  timestamp: z.string().datetime({ message: 'timestamp must be ISO 8601' }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type HeartbeatRecord = z.infer<typeof HeartbeatRecordSchema>;

// ─── Shutdown Request ───────────────────────────────────────────────────────

export const ShutdownPhaseSchema = z.enum([
  'requested', // Leader sent shutdown request
  'approved', // Target agent approved shutdown
  'rejected', // Target agent rejected shutdown
  'confirmed', // Shutdown cycle completed
  'force_killed', // Bypassed negotiation via force kill
]);

export type ShutdownPhase = z.infer<typeof ShutdownPhaseSchema>;

export const ShutdownRequestSchema = z.object({
  id: z.string().min(1, 'Request ID must be non-empty'),
  requesterAgentId: z.string().min(1),
  targetAgentId: z.string().min(1),
  teamName: z.string().min(1),
  reason: z.string().optional(),
  phase: ShutdownPhaseSchema,
  force: z.boolean().default(false),

  // Timestamps
  requestedAt: z.string().datetime({ message: 'requestedAt must be ISO 8601' }),
  respondedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),

  // Response
  responseReason: z.string().optional(),
});

export type ShutdownRequest = z.infer<typeof ShutdownRequestSchema>;

// ─── CLI Configuration ─────────────────────────────────────────────────────

export const CLIConfigSchema = z.object({
  defaultLayout: z.enum(['tiled', 'main-vertical', 'even-horizontal']).default('tiled'),
  autoCleanup: z.boolean().default(true),
  paneMinWidth: z.number().default(80),
  paneMinHeight: z.number().default(24),
  dashboardRefreshInterval: z.number().default(3),
});

export type CLIConfig = z.infer<typeof CLIConfigSchema>;

// ─── Pane Info ──────────────────────────────────────────────────────────────

export const PaneInfoSchema = z.object({
  paneId: z.string(),
  agentName: z.string(),
  teamName: z.string(),
  label: z.string(),
});

export type PaneInfo = z.infer<typeof PaneInfoSchema>;

// ─── Session Metadata ───────────────────────────────────────────────────────

export const SessionMetadataSchema = z.object({
  projectDir: z.string(),
  sessionName: z.string(),
  serverPaneId: z.string().optional(),
  agentPanes: z.array(PaneInfoSchema).default([]),
  createdAt: z.string(),
  autoCleanupEnabled: z.boolean().default(true),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;
