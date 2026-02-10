# Data Model: Robust Coordination Core

**Feature**: 001-robust-coordination-core
**Date**: 2026-02-10

## Schema Changes

All changes are backward-compatible. Existing JSON files on disk will validate
against the updated schemas due to `.default()` and `.optional()` usage.

### 1. MessageTypeSchema (NEW)

```typescript
// src/types/schemas.ts
export const MessageTypeSchema = z.enum([
  "plain",
  "idle",
  "task_assignment",
  "shutdown_request",
  "shutdown_approved",
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;
```

**Rationale**: FR-005 requires predefined structured message types. The enum is
extensible - new types can be added without breaking existing data.

### 2. MessageSchema (MODIFIED)

```typescript
// BEFORE (current)
export const MessageSchema = z.object({
  from: z.string().min(1, "Sender must be non-empty"),
  to: z.string().min(1, "Recipient must be non-empty"),
  message: z.string(),
  timestamp: z.string().datetime({ message: "timestamp must be ISO 8601" }),
  read: z.boolean().default(false),
  summary: z.string().optional(),
  recipients: z.array(z.string()).optional(),
});

// AFTER (proposed)
export const MessageSchema = z.object({
  from: z.string().min(1, "Sender must be non-empty"),
  to: z.string().min(1, "Recipient must be non-empty"),
  message: z.string(),
  type: MessageTypeSchema.default("plain"), // NEW FIELD
  timestamp: z.string().datetime({ message: "timestamp must be ISO 8601" }),
  read: z.boolean().default(false),
  summary: z.string().optional(),
  recipients: z.array(z.string()).optional(),
});
```

**Backward Compatibility**: `.default('plain')` means existing inbox JSON files
that lack the `type` field will parse as `type: 'plain'`. No migration needed.

### 3. TaskSchema (MODIFIED)

```typescript
// BEFORE (current)
export const TaskSchema = z.object({
  id: z.string().min(1, "Task ID must be non-empty"),
  title: z.string().default("Untitled Task"),
  description: z.string().optional(),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: "createdAt must be ISO 8601" }),
  updatedAt: z.string().datetime().optional(),
  owner: z.string().optional(),
  claimedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  dependencies: z.array(z.string()).default([]),
  warning: z.string().optional(),
});

// AFTER (proposed)
export const TaskSchema = z.object({
  id: z.string().min(1, "Task ID must be non-empty"),
  title: z.string().default("Untitled Task"),
  description: z.string().optional(),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  status: TaskStatusSchema,
  createdAt: z.string().datetime({ message: "createdAt must be ISO 8601" }),
  updatedAt: z.string().datetime().optional(),
  owner: z.string().optional(),
  claimedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  dependencies: z.array(z.string()).default([]),
  blocks: z.array(z.string()).default([]), // NEW FIELD (FR-009)
  warning: z.string().optional(),
});
```

**Backward Compatibility**: `.default([])` means existing task JSON files that lack
the `blocks` field will parse as `blocks: []`. No migration needed.

### 4. Status Transition Map (NEW - code only, not schema)

```typescript
// src/operations/task.ts
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress"],
  in_progress: ["completed"],
  completed: [], // terminal state - no transitions allowed
};
```

**Rationale**: FR-011 requires forward-only status progression. The map is
defined as a constant, not a schema, because it governs behavior not data shape.

## Entity Relationships

```text
TeamConfig
  |-- members: TeamMember[]
  |-- shutdownApprovals: string[]
  |
  |-- [team]/inboxes/<agent-id>.json: Message[]
  |       |-- type: MessageType (plain | idle | task_assignment |
  |       |                       shutdown_request | shutdown_approved)
  |       |-- read: boolean
  |
  |-- [team]/tasks/<task-id>.json: Task
          |-- dependencies: string[]  (blocked_by: "I need these done first")
          |-- blocks: string[]        (reverse: "these need me done first")
          |-- status: pending -> in_progress -> completed (forward-only)
```

## Cascade Behavior

When a task transitions to `completed`:

1. Read all task files in the team's task directory
2. For each task that has the completed task ID in its `dependencies` array:
   a. Remove the completed task ID from `dependencies`
   b. If `dependencies` is now empty and task has a dep-related `warning`, clear it
3. Remove the completed task ID from any task's `blocks` array (if present)
4. Write all modified tasks atomically

All cascade operations happen within the same exclusive lock scope as the
status update, ensuring consistency.

## Validation Rules

| Field                        | Rule                                                             | Error Message                               |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Message.type                 | Must be one of the MessageTypeSchema enum values                 | "Invalid message type"                      |
| Task.blocks                  | Array of valid task IDs (referential integrity checked on write) | "Blocked task {id} does not exist"          |
| Task.status transition       | Must follow VALID_TRANSITIONS map                                | "Invalid status transition: {from} -> {to}" |
| Task.dependencies on cascade | Completed task ID removed automatically                          | N/A (no error, automatic)                   |

## Storage Layout (unchanged)

```text
<project-root>/.opencode/opencode-teams/
  teams/
    <team-name>/
      config.json           # TeamConfig
      .lock                 # Team operations lock file
      inboxes/
        <agent-id>.json     # Message[] (inbox per agent)
  tasks/
    <team-name>/
      .lock                 # Task operations lock file
      <task-id>.json        # Task
```

No changes to directory structure. All changes are additive fields on existing schemas.
