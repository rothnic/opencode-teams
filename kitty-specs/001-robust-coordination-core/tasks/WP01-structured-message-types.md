---
work_package_id: WP01
title: Structured Message Types
lane: "for_review"
dependencies: []
base_branch: main
base_commit: affd8185fe6e8c498fbde64799bf32e6daa48d38
created_at: '2026-02-10T01:51:53.143272+00:00'
subtasks:
- T001
- T002
- T003
- T004
- T005
phase: Phase 1 - Schema + Operations
assignee: ''
agent: "Sisyphus"
shell_pid: "888629"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-02-10T16:24:00Z'
  lane: planned
  agent: system
  action: Prompt generated via /spec-kitty.tasks
---

# Work Package Prompt: WP01 -- Structured Message Types

## Goal

Add a `type` field to `MessageSchema` so messages carry semantic meaning (FR-005).
Wire `requestShutdown()` and `approveShutdown()` to send typed messages (P2 scenario).

## Requirements Addressed

- **FR-005**: Messages must support predefined structured types including `plain`, `idle`,
  `task_assignment`, `shutdown_request`, and `shutdown_approved`.
- **P2**: Structured shutdown coordination via typed messages.

## Dependencies

None. This WP is independent and can be implemented first.

## Subtasks

### T001: Add MessageTypeSchema and type field to MessageSchema

**File**: `src/types/schemas.ts`

Add the following between the `Inbox` section and `Message` section (around line 91):

```typescript
// --- Message Type ---
export const MessageTypeSchema = z.enum([
  "plain",
  "idle",
  "task_assignment",
  "shutdown_request",
  "shutdown_approved",
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;
```

Then add the `type` field to `MessageSchema`:

```typescript
export const MessageSchema = z.object({
  from: z.string().min(1, "Sender must be non-empty"),
  to: z.string().min(1, "Recipient must be non-empty"),
  message: z.string(),
  type: MessageTypeSchema.default("plain"), // <-- NEW FIELD
  timestamp: z.string().datetime({ message: "timestamp must be ISO 8601" }),
  read: z.boolean().default(false),
  summary: z.string().optional(),
  recipients: z.array(z.string()).optional(),
});
```

**Backward compatibility**: `.default('plain')` means existing inbox JSON files that lack
the `type` field will parse as `type: 'plain'`. No migration needed.

**Verification**: `bun x tsc --noEmit` must pass. No existing tests should break because
the default covers the missing field.

### T002: Add sendTypedMessage() helper

**File**: `src/operations/team.ts`

Add a private helper function that the shutdown methods will use. This avoids duplicating
message construction logic. Place it inside the `TeamOperations` object:

```typescript
/**
 * Internal helper: send a typed message to a specific agent's inbox.
 * Used by shutdown coordination flow.
 */
_sendTypedMessage: (
  teamName: string,
  targetAgentId: string,
  messageText: string,
  type: MessageType,
  fromAgentId: string,
): Message => {
  const inboxPath = getAgentInboxPath(teamName, targetAgentId);
  const lockPath = getTeamLockPath(teamName);

  const messageData: Message = {
    from: fromAgentId,
    to: targetAgentId,
    message: messageText,
    type,
    timestamp: new Date().toISOString(),
    read: false,
  };

  MessageSchema.parse(messageData);

  lockedUpsert(lockPath, inboxPath, InboxSchema, [], (inbox) => {
    return [...inbox, messageData];
  });

  return messageData;
},
```

**Import update**: Add `MessageType` to the import from `'../types/schemas'`:

```typescript
import {
  InboxSchema,
  type LeaderInfo,
  type Message,
  type MessageType, // <-- ADD
  MessageSchema,
  // ... rest
} from "../types/schemas";
```

### T003: Update requestShutdown() to send typed message

**File**: `src/operations/team.ts`

After the existing `lockedUpdate` call in `requestShutdown()`, add a call to send a
`shutdown_request` message to the team leader:

```typescript
requestShutdown: (teamName: string, agentId?: string): TeamConfig => {
  const configPath = getTeamConfigPath(teamName);
  const lockPath = getTeamLockPath(teamName);

  if (!fileExists(configPath)) {
    throw new Error(`Team "${teamName}" does not exist`);
  }

  const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';

  const config = lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
    const approvals = config.shutdownApprovals || [];
    if (!approvals.includes(currentAgentId)) {
      approvals.push(currentAgentId);
    }
    return { ...config, shutdownApprovals: approvals };
  });

  // Send typed shutdown_request message to leader
  if (currentAgentId !== config.leader) {
    TeamOperations._sendTypedMessage(
      teamName,
      config.leader,
      `Agent ${currentAgentId} requests team shutdown`,
      'shutdown_request',
      currentAgentId,
    );
  }

  return config;
},
```

**Note**: Only send the message if the requester is not the leader (avoids self-messaging).

### T004: Update approveShutdown() to send typed message

**File**: `src/operations/team.ts`

Replace the current `approveShutdown` (which is just an alias for `requestShutdown`)
with a proper implementation that also sends a `shutdown_approved` message:

```typescript
approveShutdown: (teamName: string, agentId?: string): TeamConfig => {
  const configPath = getTeamConfigPath(teamName);
  const lockPath = getTeamLockPath(teamName);

  if (!fileExists(configPath)) {
    throw new Error(`Team "${teamName}" does not exist`);
  }

  const currentAgentId = agentId || process.env.OPENCODE_AGENT_ID || 'unknown';

  const config = lockedUpdate(lockPath, configPath, TeamConfigSchema, (config) => {
    const approvals = config.shutdownApprovals || [];
    if (!approvals.includes(currentAgentId)) {
      approvals.push(currentAgentId);
    }
    return { ...config, shutdownApprovals: approvals };
  });

  // Send shutdown_approved to all members who requested shutdown
  const approvals = config.shutdownApprovals || [];
  for (const requesterId of approvals) {
    if (requesterId !== currentAgentId) {
      TeamOperations._sendTypedMessage(
        teamName,
        requesterId,
        `Agent ${currentAgentId} approved team shutdown`,
        'shutdown_approved',
        currentAgentId,
      );
    }
  }

  return config;
},
```

### T005: Create tests/message-types.test.ts

**File**: `tests/message-types.test.ts` (NEW)

Test the following scenarios:

1. **Backward compatibility**: Parse a message object WITHOUT `type` field; verify it
   defaults to `'plain'`.
2. **Schema validation**: Create messages with each valid type (`plain`, `idle`,
   `task_assignment`, `shutdown_request`, `shutdown_approved`); all must parse.
3. **Invalid type rejection**: Attempt to parse a message with `type: 'invalid'`; must fail.
4. **Shutdown request sends typed message**: Call `requestShutdown()`, then read the leader's
   inbox; verify a message with `type: 'shutdown_request'` exists.
5. **Shutdown approval sends typed message**: Call `approveShutdown()`, then read the
   requester's inbox; verify a message with `type: 'shutdown_approved'` exists.
6. **Type preserved on disk**: Send a typed message via `write()` (after updating `write()`
   to accept optional type, or test via `_sendTypedMessage`), re-read from disk, verify type.

**Test setup pattern**: Follow the same `beforeEach`/`afterEach` pattern used in
`tests/team-operations.test.ts` (temp dir, env save/restore, team creation).

## Acceptance Criteria

- [ ] `MessageTypeSchema` exported from `src/types/schemas.ts`
- [ ] `MessageType` type alias exported
- [ ] `MessageSchema` includes `type` field with `.default('plain')`
- [ ] Existing inbox JSON without `type` field parses successfully as `'plain'`
- [ ] `requestShutdown()` sends `shutdown_request` message to leader inbox
- [ ] `approveShutdown()` sends `shutdown_approved` message to requester inboxes
- [ ] `bun x tsc --noEmit` passes
- [ ] `bun test` passes (all existing + new tests)
- [ ] `bunx biome check src/ tests/` passes

## Activity Log

- 2026-02-10T01:51:55Z – Sisyphus – shell_pid=888629 – lane=doing – Assigned agent via workflow command
- 2026-02-10T01:58:09Z – Sisyphus – shell_pid=888629 – lane=for_review – Ready for review: MessageTypeSchema, _sendTypedMessage, typed requestShutdown/approveShutdown, 202 tests pass
