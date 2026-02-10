# Implementation Plan: Robust Coordination Core

**Branch**: `001-robust-coordination-core` | **Date**: 2026-02-10 | **Spec**: `kitty-specs/001-robust-coordination-core/spec.md`
**Input**: Feature specification from `kitty-specs/001-robust-coordination-core/spec.md`

## Summary

Harden the existing coordination layer to meet all 13 functional requirements in the spec.
The codebase already passes FR-001 through FR-004, FR-006 through FR-008, FR-012, and FR-013.
Four gaps remain: structured message types (FR-005), bidirectional dependency fields (FR-009),
cascade unblocking on task completion (FR-010), and forward-only status transitions (FR-011).
The shutdown coordination scenario (P2) also requires wiring through the message system.
Finally, integration and stress tests must be added to prove the concurrency guarantees.

## Technical Context

**Language/Version**: TypeScript 5.3+ with `strict: true`
**Runtime**: Bun >= 1.3.2
**Primary Dependencies**: zod (validation), Bun FFI fcntl (file locking)
**Storage**: File-based JSON in `<project-root>/.opencode/opencode-teams/`
**Testing**: Vitest (v3.2+) via `bun test`
**Target Platform**: Linux, macOS (fcntl locking; Windows not supported)
**Project Type**: Single project (OpenCode plugin)
**Concurrency Model**: Advisory file locks via Bun FFI fcntl() + atomic writes (write-temp-then-rename)
**Out of Scope**: Yjs/CRDT (deferred to later feature), SQLite migration, Windows flock support

## Constitution Check

**GATE**: Must pass before Phase 0 research. Re-check after Phase 1 design.

| Constitution Rule                     | Compliance         | Notes                                      |
| ------------------------------------- | ------------------ | ------------------------------------------ |
| TypeScript strict mode                | PASS               | No changes to tsconfig                     |
| Bun-first development                 | PASS               | Uses Bun FFI, Bun.sleep, Bun.file patterns |
| Zod validation on I/O boundaries      | PASS               | All schema changes validated on read/write |
| Minimal dependencies                  | PASS               | No new dependencies introduced             |
| Advisory file locking + atomic writes | PASS               | Existing infrastructure reused             |
| Test isolation (temp dirs, cleanup)   | REQUIRES ATTENTION | New integration tests must follow pattern  |
| ES Modules exclusively                | PASS               | No changes                                 |
| Conventional commits                  | PASS               | Will follow                                |
| Biome formatting                      | PASS               | Will run `biome check --write .`           |
| No type suppression                   | PASS               | No `as any`, `@ts-ignore`                  |

## Gap Analysis

### Passing Requirements (no code changes needed)

| FR     | What                          | Implementation                                                 |
| ------ | ----------------------------- | -------------------------------------------------------------- |
| FR-001 | Exclusive write access        | `acquireLock(lockPath, true)` in `withLock()` via fcntl FFI    |
| FR-002 | Atomic writes                 | `writeAtomicJSON()` in `src/utils/fs-atomic.ts`                |
| FR-003 | Validated data                | Zod schemas on every `readValidatedJSON()`/`writeAtomicJSON()` |
| FR-004 | Per-agent inbox storage       | `getAgentInboxPath()` -> `<team>/inboxes/<agent-id>.json`      |
| FR-006 | Message read tracking         | `read: z.boolean().default(false)` updated in `readMessages()` |
| FR-007 | Long-polling < 1s             | `Bun.sleep(500)` in `pollInbox()`                              |
| FR-008 | Empty long-poll response      | Returns `[]` on timeout                                        |
| FR-012 | Circular dependency detection | BFS in `checkCircularDependency()`                             |
| FR-013 | Soft blocking on claims       | `claimTask()` sets `warning` field when deps unmet             |

### Failing Requirements (code changes needed)

**FR-005: Structured Message Types** (FAIL)

- Current: `MessageSchema` has no `type` field. All messages are untyped strings.
- Required: Discriminated type with values: `plain`, `idle`, `task_assignment`,
  `shutdown_request`, `shutdown_approved`.
- Fix: Add `type` field to `MessageSchema` with `.default('plain')` for backward compatibility
  with existing inbox JSON files on disk.
- Files: `src/types/schemas.ts`, `src/operations/team.ts`

**FR-009: Bidirectional Dependency Fields** (PARTIAL)

- Current: `TaskSchema` has `dependencies` (effectively `blocked_by`), but no `blocks` field.
- Required: Both `blocks` and `blocked_by` fields per spec.
- Design decision: Keep `dependencies` as the canonical `blocked_by` list. Add a denormalized
  `blocks` field maintained when dependencies are created/updated/deleted.
- Fix: Add optional `blocks` field to `TaskSchema`. When creating a task with dependencies,
  update each dependency's `blocks` array to include the new task ID. When deleting a task,
  remove it from all other tasks' `blocks` arrays.
- Files: `src/types/schemas.ts`, `src/operations/task.ts`

**FR-010: Cascade Unblocking on Task Completion** (FAIL)

- Current: `updateTask()` writes the status change but does not cascade. `areDependenciesMet()`
  checks lazily at claim time.
- Required: Completing a task must automatically update dependent tasks.
- Fix: When `updateTask()` transitions a task to `completed`, scan all tasks in the team for
  those with this task in their `dependencies` array. Remove the completed task ID from their
  `dependencies`. If a dependent task's `dependencies` becomes empty and it has a `warning`
  about unmet deps, clear the warning.
- Alternative considered: Keep lazy checking only (no cascade). Rejected because the spec
  explicitly says "automatically remove it from the blocked_by lists" (FR-010).
- Files: `src/operations/task.ts`

**FR-011: Forward-Only Status Transitions** (FAIL)

- Current: `updateTask()` validates the status is a valid enum value, but does not enforce
  transition direction. You can go from `completed` back to `pending`.
- Required: Only `pending` -> `in_progress` -> `completed`. No backward transitions.
- Fix: Add a `VALID_TRANSITIONS` map and check `currentStatus -> newStatus` before applying.
- Files: `src/operations/task.ts`

### Scenario Gap: P2 Structured Shutdown (PARTIAL)

- Current: `requestShutdown()` adds `agentId` to `shutdownApprovals` array on `TeamConfig`.
  `approveShutdown()` is just an alias for `requestShutdown()`. No messages are sent.
- Required: Agent sends a `shutdown_request` message; leader/team sends `shutdown_approved` back.
- Fix: `requestShutdown()` should additionally send a message with `type: 'shutdown_request'`
  to the leader (or broadcast). `approveShutdown()` should send `type: 'shutdown_approved'`
  back to the requesting agent. The existing `shutdownApprovals` array on TeamConfig remains
  as the authoritative state; messages provide the communication channel.
- Files: `src/operations/team.ts`

### Testing Gaps

- No cross-process concurrency tests (current tests are single-process `Promise.allSettled`)
- No integration test script (`tests/integration.sh` referenced in constitution but absent)
- No edge case tests for: disk full during atomic write, corrupted JSON recovery, lock contention
- No end-to-end scenario tests for P1-P4 acceptance criteria
- Need tests for new features: message type filtering, bidirectional deps, status transition
  guard, cascade unblock

## Project Structure

### Documentation (this feature)

```text
kitty-specs/001-robust-coordination-core/
  plan.md              # This file
  research.md          # Phase 0 research findings
  data-model.md        # Phase 1 schema changes
  quickstart.md        # Phase 1 verification guide
```

### Source Code (repository root)

```text
src/
  types/
    schemas.ts           # MODIFY: MessageTypeSchema, Task.blocks, valid transitions
  operations/
    task.ts              # MODIFY: cascade unblock, forward-only transitions, blocks sync
    team.ts              # MODIFY: typed messages in shutdown flow
  utils/
    file-lock.ts         # NO CHANGE
    fs-atomic.ts         # NO CHANGE
    storage-paths.ts     # NO CHANGE

tests/
  task-operations.test.ts       # MODIFY: add tests for FR-009, FR-010, FR-011
  team-operations.test.ts       # MODIFY: add tests for FR-005, P2 shutdown
  message-types.test.ts         # NEW: structured message type tests
  status-transitions.test.ts    # NEW: forward-only transition tests
  cascade-unblock.test.ts       # NEW: dependency cascade tests
  concurrency-stress.test.ts    # NEW: multi-process stress tests
```

**Structure Decision**: Single project, existing directory layout. No new directories needed.
All changes are modifications to existing files plus new test files in `tests/`.

## Implementation Scope

### Work Package 1: Structured Message Types (FR-005 + P2)

Add `type` field to `MessageSchema` with discriminated values.
Wire `requestShutdown()` and `approveShutdown()` to send typed messages.
Add `sendTypedMessage()` helper for internal use.

Estimated files changed: 2 source + 2 test files

### Work Package 2: Bidirectional Dependencies (FR-009)

Add `blocks` field to `TaskSchema`. Maintain denormalized `blocks` lists
when creating/updating/deleting tasks with dependencies.

Estimated files changed: 2 source + 1 test file

### Work Package 3: Cascade Unblocking + Status Transitions (FR-010 + FR-011)

Add forward-only transition guard. Add cascade logic on task completion
that removes completed task from dependents' `dependencies` arrays.

Estimated files changed: 1 source + 2 test files

### Work Package 4: Integration and Stress Tests

Multi-process concurrency tests, end-to-end P1-P4 scenario tests,
edge case tests for atomic write failures and lock contention.

Estimated files changed: 2 new test files

## Complexity Tracking

No constitution violations. All changes fit within existing architecture.
No new dependencies. No new directories. No structural changes.
