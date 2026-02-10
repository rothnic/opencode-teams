# Data Model: Agent Lifecycle and Spawning

**Feature**: 002-agent-lifecycle-spawning
**Date**: 2026-02-10
**Status**: Complete
**Source**: plan.md (Architecture Overview), research.md (R1-R8), spec.md (Key Entities)

## Overview

All schemas use Zod for runtime validation, following the existing pattern in `src/types/schemas.ts`. Every JSON file written to disk passes through schema validation. Schemas use camelCase field names and ISO 8601 datetime strings.

Storage root: `<project-root>/.opencode/opencode-teams/`

## Entity: AgentState

Represents a spawned agent's full lifecycle state. Persisted as individual JSON files.

**Storage path**: `<project-root>/.opencode/opencode-teams/agents/<agent-id>.json`
**Lock path**: `<project-root>/.opencode/opencode-teams/agents/.lock`

```typescript
// src/types/schemas.ts (EXTEND)

export const AgentStatusSchema = z.enum([
  'spawning',     // Process started, not yet confirmed alive
  'active',       // Running and heartbeating normally
  'idle',         // Session idle event received, waiting for input
  'inactive',     // Heartbeat timeout, presumed dead
  'shutting_down', // Graceful shutdown in progress
  'terminated',   // Clean shutdown completed
]);

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentStateSchema = z.object({
  // Identity
  id: z.string().min(1, 'Agent ID must be non-empty'),
  name: z.string().min(1, 'Agent name must be non-empty'),
  teamName: z.string().min(1, 'Team name must be non-empty'),
  role: z.enum(['leader', 'worker', 'reviewer']).default('worker'),

  // Model configuration
  model: z.string().min(1, 'Model identifier must be non-empty'),
  providerId: z.string().optional(), // e.g., "anthropic", "openai"

  // Process linkage
  sessionId: z.string().min(1, 'Session ID must be non-empty'),
  paneId: z.string().optional(),     // tmux pane identifier (e.g., "%42")
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

### Field Descriptions

| Field | Source | Purpose |
|-------|--------|---------|
| `id` | Generated (UUID v4) | Unique agent identifier across all teams |
| `name` | User-provided or generated | Human-readable agent label |
| `teamName` | From spawn request | Links agent to its team (FK to TeamConfig.name) |
| `role` | From spawn request | Determines agent capabilities |
| `model` | From spawn request | AI model used (e.g., "claude-sonnet-4-20250514") |
| `providerId` | From spawn request | Optional provider override |
| `sessionId` | From SDK session.new() | OpenCode SDK session identifier |
| `paneId` | From tmux split-window | Tmux pane for TUI visibility |
| `serverPort` | From ServerManager | Port of the OpenCode server this agent connects to |
| `cwd` | From spawn request or project root | Agent's working directory |
| `initialPrompt` | From spawn request | The prompt that started this agent |
| `color` | From ColorPool | Unique color for visual identification |
| `status` | Managed by lifecycle | Current lifecycle phase |
| `isActive` | Derived from status | `true` when status is `active` or `idle` |
| `heartbeatTs` | Updated by heartbeat | Last confirmed liveness timestamp |
| `consecutiveMisses` | Updated by monitor | Number of missed heartbeat cycles (threshold: 2) |
| `lastError` | From error recovery | Last error message for diagnostics |
| `sessionRotationCount` | From error recovery | Times session was rotated (context limit recovery) |

### Status Transitions

```
spawning --> active       (first heartbeat or SDK event received)
active   --> idle         (session.idle event)
idle     --> active       (session.updated or tool.execute.after event)
active   --> shutting_down (shutdown request accepted)
idle     --> shutting_down (shutdown request accepted)
active   --> inactive     (2 consecutive heartbeat misses)
idle     --> inactive     (2 consecutive heartbeat misses)
shutting_down --> terminated (clean exit confirmed)
any      --> terminated   (force kill executed)
inactive --> terminated   (cleanup after task reassignment)
```

## Entity: ServerInfo

Represents a running OpenCode server instance. One server per project.

**Storage path**: `<project-root>/.opencode/opencode-teams/servers/<project-hash>/server.json`

```typescript
// src/types/schemas.ts (EXTEND)

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

### Port Calculation (deterministic)

```typescript
// From research.md R2
function portForProject(projectPath: string): number {
  const absPath = path.resolve(projectPath);
  const hash = crypto.createHash('md5').update(absPath).digest();
  const offset = (hash[0] << 8) | hash[1];
  return 28000 + (offset % 1000);
}
```

Range: `28000-28999` (1000 ports). The `projectHash` field stores the hex digest for directory naming.

## Entity: HeartbeatRecord

Lightweight record for heartbeat events. Not persisted to individual files; stored as updates to AgentState.heartbeatTs. This schema is used for the heartbeat tool's input validation and internal event processing.

```typescript
// src/types/schemas.ts (EXTEND)

export const HeartbeatSourceSchema = z.enum([
  'tool',           // Explicit heartbeat tool call by agent
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
  metadata: z.record(z.string(), z.unknown()).optional(), // SDK event properties
});

export type HeartbeatRecord = z.infer<typeof HeartbeatRecordSchema>;
```

### Heartbeat Thresholds (from plan.md)

| Parameter | Value | Source |
|-----------|-------|--------|
| Heartbeat interval | 30s | FR-004, Success Criteria |
| Stale detection threshold | 60s | Plan: Architecture Overview |
| Monitor sweep interval | 15s | Plan: Heartbeat Monitoring Flow |
| Grace period | 2 consecutive misses | Plan: prevents false positives |

## Entity: ShutdownRequest

Represents a request to gracefully shut down an agent. Implements the three-phase negotiation protocol from FR-003.

**Storage path**: Embedded in team messaging (uses existing MessageSchema with type `shutdown_request` / `shutdown_approved`). No separate file.

```typescript
// src/types/schemas.ts (EXTEND)

export const ShutdownPhaseSchema = z.enum([
  'requested',   // Leader sent shutdown request
  'approved',    // Target agent approved shutdown
  'rejected',    // Target agent rejected shutdown
  'confirmed',   // Shutdown cycle completed
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
  responseReason: z.string().optional(), // Agent's reason for approval/rejection
});

export type ShutdownRequest = z.infer<typeof ShutdownRequestSchema>;
```

### Three-Phase Protocol (FR-003)

```
Phase 1: Leader sends ShutdownRequest (phase: 'requested')
  - Delivered as MessageType 'shutdown_request' to target agent's inbox
  - Target agent receives via inbox polling

Phase 2: Target agent responds (phase: 'approved' or 'rejected')
  - Delivered as MessageType 'shutdown_approved' back to requester
  - If rejected, requester can force-kill (FR-002)

Phase 3: Confirmation and cleanup (phase: 'confirmed')
  - Agent completes current work
  - AgentState.status transitions to 'terminated'
  - Tmux pane cleaned up
  - Tasks reassigned if needed (FR-008)
```

## Entity: ColorAssignment

Manages the color pool for agent visual identification. Prevents duplicate colors across active agents.

**Storage path**: `<project-root>/.opencode/opencode-teams/color-pool.json`

```typescript
// src/utils/color-pool.ts (NEW)

export const COLOR_PALETTE = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
] as const;

export const ColorPoolSchema = z.object({
  assignments: z.record(
    z.string(), // agentId
    z.string().regex(/^#[0-9a-fA-F]{6}$/),
  ),
  lastUpdated: z.string().datetime(),
});

export type ColorPool = z.infer<typeof ColorPoolSchema>;
```

When all 10 colors are exhausted, new agents receive the least-recently-used color from inactive agents, or a deterministic fallback based on agent ID hash.

## Storage Path Extensions

New paths to add to `src/utils/storage-paths.ts`:

```typescript
// Agents directory
// <project-root>/.opencode/opencode-teams/agents/
export function getAgentsDir(projectRoot?: string): string;

// Individual agent state file
// <project-root>/.opencode/opencode-teams/agents/<agent-id>.json
export function getAgentStatePath(agentId: string, projectRoot?: string): string;

// Agent state lock file
// <project-root>/.opencode/opencode-teams/agents/.lock
export function getAgentLockPath(projectRoot?: string): string;

// Servers directory
// <project-root>/.opencode/opencode-teams/servers/
export function getServersDir(projectRoot?: string): string;

// Individual server state
// <project-root>/.opencode/opencode-teams/servers/<project-hash>/server.json
export function getServerStatePath(projectHash: string, projectRoot?: string): string;

// Server log file
// <project-root>/.opencode/opencode-teams/servers/<project-hash>/server.log
export function getServerLogPath(projectHash: string, projectRoot?: string): string;

// Color pool state
// <project-root>/.opencode/opencode-teams/color-pool.json
export function getColorPoolPath(projectRoot?: string): string;
```

## Relationship Map

```
TeamConfig (existing)
  |-- name (PK)
  |-- members[].agentId --> AgentState.id
  |-- leader --> AgentState.id (of leader agent)

AgentState (NEW)
  |-- id (PK, UUID v4)
  |-- teamName --> TeamConfig.name (FK)
  |-- sessionId --> OpenCode SDK session (external)
  |-- paneId --> tmux pane (external)
  |-- serverPort --> ServerInfo.port (FK)
  |-- color --> ColorPool.assignments[agentId]

ServerInfo (NEW)
  |-- projectPath + projectHash (composite PK)
  |-- pid --> OS process (external)
  |-- port --> network port (unique per project)

ShutdownRequest (NEW)
  |-- id (PK, UUID v4)
  |-- requesterAgentId --> AgentState.id (FK)
  |-- targetAgentId --> AgentState.id (FK)
  |-- teamName --> TeamConfig.name (FK)
  |-- Delivered via MessageSchema (existing, types: shutdown_request/shutdown_approved)

HeartbeatRecord (NEW, transient)
  |-- agentId --> AgentState.id (FK)
  |-- sessionId --> AgentState.sessionId
  |-- Not persisted independently; updates AgentState.heartbeatTs

ColorPool (NEW)
  |-- assignments[agentId] --> AgentState.id (FK)
```

## Concurrency and Locking

All agent state mutations use the existing `withLock()` advisory file locking pattern from `src/utils/file-lock.ts`:

- **Agent state writes**: Lock on `getAgentLockPath()` (single lock for all agents, matches team/task pattern)
- **Server state writes**: Lock on server directory (one writer at a time per project)
- **Color pool writes**: Lock on color pool file path
- **Task reassignment**: Uses existing `getTaskLockPath(teamName)` (no new lock needed)

## Validation Rules

1. `AgentState.id` must be unique across all teams (UUID v4 guarantees this)
2. `AgentState.teamName` must reference an existing TeamConfig
3. `AgentState.serverPort` must match the deterministic port for the project
4. `AgentState.color` must be from COLOR_PALETTE or a valid hex color
5. `AgentState.consecutiveMisses` resets to 0 on any heartbeat received
6. `ServerInfo.port` must be in range 28000-28999
7. `ShutdownRequest.targetAgentId` must reference an active agent
8. `ShutdownRequest.requesterAgentId` must be the team leader or have leader permissions
