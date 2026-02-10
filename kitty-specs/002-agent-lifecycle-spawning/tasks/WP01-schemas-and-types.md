---
work_package_id: WP01
title: Schemas and Types
lane: "for_review"
dependencies: []
base_branch: main
base_commit: e5cf53c726872183e2caff7080d86bc068ff07cb
created_at: '2026-02-10T06:28:39.925322+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
- T006
phase: Phase 1 - Foundation
assignee: ''
agent: ''
shell_pid: "1368003"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-02-10T06:00:00Z'
  lane: planned
  agent: system
  action: Prompt generated via /spec-kitty.tasks
---
# Work Package Prompt: WP01 – Schemas and Types

## Objective

Extend `src/types/schemas.ts` with all new Zod schemas for the agent lifecycle feature: `AgentState`, `ServerInfo`, `HeartbeatRecord`, and `ShutdownRequest` entities. Re-export all new types from `src/types/index.ts`.

This is a **foundation WP** — every other WP depends on these schemas being correct and complete.

## Context

### Codebase Location
- **Target file**: `src/types/schemas.ts` (EXTEND — do NOT overwrite existing schemas)
- **Re-export file**: `src/types/index.ts` (EXTEND)
- **Data model reference**: `kitty-specs/002-agent-lifecycle-spawning/data-model.md`
- **Existing patterns**: Look at `TeamConfigSchema`, `TaskSchema`, `MessageSchema` in `src/types/schemas.ts` for established patterns

### Existing Patterns to Follow
1. **Section comments**: Use `// ─── Section Name ───...` separators (see existing file)
2. **Type exports**: Each schema has a companion `export type X = z.infer<typeof XSchema>;`
3. **Validation messages**: All datetime fields use `{ message: 'fieldName must be ISO 8601' }`
4. **String constraints**: Use `.min(1, 'descriptive message')` for required strings
5. **Defaults**: Use `.default(value)` for fields with sensible defaults
6. **Import**: Only `z` from `'zod'` is imported (already present)

### Constitution Constraints
- **No `as any`** or type suppression
- **Strict mode**: All types must be fully compatible with `strict: true`
- **Zod validation on I/O**: Every JSON file on disk passes through these schemas

## Subtasks

### T001: Add `AgentStatusSchema` enum

Add after the existing `MessageSchema` section. This enum represents the lifecycle phases of an agent.

```typescript
// ─── Agent Status ───────────────────────────────────────────────────────────

export const AgentStatusSchema = z.enum([
  'spawning',      // Process started, not yet confirmed alive
  'active',        // Running and heartbeating normally
  'idle',          // Session idle event received, waiting for input
  'inactive',      // Heartbeat timeout, presumed dead
  'shutting_down', // Graceful shutdown in progress
  'terminated',    // Clean shutdown completed
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
```

### T002: Add `AgentStateSchema` object

The primary entity. Copy the schema **exactly** from `data-model.md` (lines 35–74), preserving all field names, constraints, and validation messages.

Key fields:
- `id`: UUID v4 string, min(1)
- `name`: Human-readable, min(1)
- `teamName`: FK to TeamConfig.name, min(1)
- `role`: enum `['leader', 'worker', 'reviewer']`, default `'worker'`
- `model`: AI model string, min(1)
- `providerId`: optional string
- `sessionId`: SDK session, min(1)
- `paneId`: optional tmux pane ID
- `serverPort`: int, min(1024), max(65535)
- `cwd`: working directory, min(1)
- `initialPrompt`: optional
- `color`: hex color regex `/^#[0-9a-fA-F]{6}$/`
- `status`: AgentStatusSchema
- `isActive`: boolean
- `createdAt`, `heartbeatTs`: required ISO 8601 datetime
- `updatedAt`, `terminatedAt`: optional ISO 8601 datetime
- `consecutiveMisses`: nonnegative int, default 0
- `lastError`: optional
- `sessionRotationCount`: nonnegative int, default 0

```typescript
// ─── Agent State ────────────────────────────────────────────────────────────

export const AgentStateSchema = z.object({
  // Identity
  id: z.string().min(1, 'Agent ID must be non-empty'),
  name: z.string().min(1, 'Agent name must be non-empty'),
  teamName: z.string().min(1, 'Team name must be non-empty'),
  role: z.enum(['leader', 'worker', 'reviewer']).default('worker'),

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
```

### T003: Add `ServerInfoSchema` object

Represents a running OpenCode server instance. One server per project.

```typescript
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
```

### T004: Add `HeartbeatSourceSchema` and `HeartbeatRecordSchema`

Lightweight record for heartbeat events. Not persisted independently; used for tool input validation and internal event processing.

```typescript
// ─── Heartbeat Record ───────────────────────────────────────────────────────

export const HeartbeatSourceSchema = z.enum([
  'tool',                // Explicit heartbeat tool call by agent
  'sdk_session_idle',    // SDK session.idle event
  'sdk_session_updated', // SDK session.updated event
  'sdk_tool_execute',    // SDK tool.execute.after event
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
```

### T005: Add `ShutdownPhaseSchema` and `ShutdownRequestSchema`

Implements the three-phase shutdown negotiation protocol (FR-003).

```typescript
// ─── Shutdown Request ───────────────────────────────────────────────────────

export const ShutdownPhaseSchema = z.enum([
  'requested',    // Leader sent shutdown request
  'approved',     // Target agent approved shutdown
  'rejected',     // Target agent rejected shutdown
  'confirmed',    // Shutdown cycle completed
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
```

### T006: Re-export from `types/index.ts`

Add re-exports for all new types. The existing `src/types/index.ts` re-exports from `schemas.ts`. Add the new type names to the existing re-export list:

```typescript
// Add these to existing re-exports from './schemas':
export type {
  // ... existing exports ...
  AgentStatus,
  AgentState,
  ServerInfo,
  HeartbeatSource,
  HeartbeatRecord,
  ShutdownPhase,
  ShutdownRequest,
} from './schemas';

export {
  // ... existing exports ...
  AgentStatusSchema,
  AgentStateSchema,
  ServerInfoSchema,
  HeartbeatSourceSchema,
  HeartbeatRecordSchema,
  ShutdownPhaseSchema,
  ShutdownRequestSchema,
} from './schemas';
```

## Verification Checklist

- [ ] `mise run typecheck` passes with no errors
- [ ] `mise run lint` passes (single quotes, 100 char width, 2 space indent)
- [ ] All new schemas use `.min(1, 'message')` for required strings
- [ ] All datetime fields use `{ message: '... must be ISO 8601' }`
- [ ] All `z.infer<typeof XSchema>` types are exported
- [ ] No `as any`, `@ts-ignore`, or `@ts-expect-error`
- [ ] Section separators match existing style: `// ─── Section Name ───...`
- [ ] Existing schemas (TeamConfig, Task, Message, etc.) are NOT modified
- [ ] `bun test tests/` still passes (no regressions)

## Activity Log

- 2026-02-10T06:30:50Z – unknown – shell_pid=1368003 – lane=for_review – Moved to for_review
