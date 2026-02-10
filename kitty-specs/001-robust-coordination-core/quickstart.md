# Quickstart: Robust Coordination Core

**Feature**: 001-robust-coordination-core
**Date**: 2026-02-10

## What This Feature Does

Hardens the existing team coordination layer to fully satisfy the spec's 13 functional
requirements. Most infrastructure already exists; this feature fills 4 gaps and adds
comprehensive test coverage.

## Changes at a Glance

| Area                | Change                                                     | Files                                            |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Structured messages | Add `type` field to MessageSchema                          | `src/types/schemas.ts`, `src/operations/team.ts` |
| Bidirectional deps  | Add `blocks` field to TaskSchema                           | `src/types/schemas.ts`, `src/operations/task.ts` |
| Cascade unblocking  | Auto-remove completed tasks from dependents                | `src/operations/task.ts`                         |
| Status transitions  | Enforce forward-only (pending -> in_progress -> completed) | `src/operations/task.ts`                         |
| Shutdown messages   | Wire shutdown flow through typed messages                  | `src/operations/team.ts`                         |
| Tests               | Integration, stress, and edge case tests                   | `tests/*.test.ts` (new + modified)               |

## Verification Checklist

After implementation, verify each requirement:

### FR-001 through FR-004 (pre-existing - smoke test only)

```bash
# Run existing tests to confirm no regressions
bun test tests/file-lock.test.ts
bun test tests/fs-atomic.test.ts
bun test tests/team-operations.test.ts
bun test tests/storage-paths.test.ts
```

### FR-005: Structured Message Types

```bash
bun test tests/message-types.test.ts
```

Verify:

- Messages without `type` field parse as `type: 'plain'` (backward compat)
- Messages with explicit type are stored and retrieved correctly
- `pollInbox()` can filter by message type
- Invalid type values are rejected by schema validation

### FR-009: Bidirectional Dependencies

```bash
bun test tests/task-operations.test.ts
```

Verify:

- Creating task B with `dependencies: [A]` adds B to A's `blocks` array
- Deleting task B removes B from A's `blocks` array
- Both `dependencies` and `blocks` are readable on task objects

### FR-010: Cascade Unblocking

```bash
bun test tests/cascade-unblock.test.ts
```

Verify:

- Completing task A removes A from B's `dependencies` when B depends on A
- Chained dependencies cascade: completing root unblocks the chain
- Warning on dependent task is cleared when all deps are met

### FR-011: Forward-Only Status Transitions

```bash
bun test tests/status-transitions.test.ts
```

Verify:

- `pending -> in_progress`: allowed
- `in_progress -> completed`: allowed
- `completed -> pending`: rejected with error
- `completed -> in_progress`: rejected with error
- `in_progress -> pending`: rejected with error

### P2: Structured Shutdown

```bash
bun test tests/team-operations.test.ts
```

Verify:

- `requestShutdown()` sends `type: 'shutdown_request'` message to leader
- `approveShutdown()` sends `type: 'shutdown_approved'` message back
- Messages appear in recipient inboxes with correct type

### Full Suite

```bash
# All tests must pass
bun test

# Type check must pass
bun x tsc --noEmit

# Lint must pass
bunx biome check src/ tests/

# Build must pass
bun x tsc
```

## Backward Compatibility

All schema changes use `.default()` values:

- `Message.type` defaults to `'plain'`
- `Task.blocks` defaults to `[]`

Existing JSON files on disk will continue to validate without migration.
New fields are populated only when explicitly set or through cascade operations.
