# Tasks: Robust Coordination Core

**Feature**: 001-robust-coordination-core
**Date**: 2026-02-10
**Spec**: `kitty-specs/001-robust-coordination-core/spec.md`
**Plan**: `kitty-specs/001-robust-coordination-core/plan.md`

## Overview

17 subtasks grouped into 4 work packages. All changes are additive (backward-compatible
schema additions, new logic guards, new test files). No new runtime dependencies.

## Dependency Graph

```text
WP01 (Message Types)     WP02 (Bidir. Deps)
      |                        |
      |                        v
      |                  WP03 (Transitions + Cascade)
      |                        |
      v                        v
      +-------> WP04 (Integration Tests) <-------+
```

- WP01 and WP02 are independent of each other and can run in parallel.
- WP03 depends on WP02 (cascade needs the `blocks` field).
- WP04 depends on WP01, WP02, and WP03 (integration tests verify all features).

## Work Packages

### WP01: Structured Message Types (FR-005 + P2)

**Files**: `src/types/schemas.ts`, `src/operations/team.ts`, `tests/message-types.test.ts`
**Dependencies**: None
**Prompt**: `tasks/WP01-structured-message-types.md`

| Subtask | Description                                                                           |
| ------- | ------------------------------------------------------------------------------------- |
| T001    | Add `MessageTypeSchema` enum, `MessageType` type, and `type` field to `MessageSchema` |
| T002    | Add internal `sendTypedMessage()` helper to `src/operations/team.ts`                  |
| T003    | Update `requestShutdown()` to send `shutdown_request` typed message to leader         |
| T004    | Update `approveShutdown()` to send `shutdown_approved` typed message to requester     |
| T005    | Create `tests/message-types.test.ts` with backward compat and type validation tests   |

### WP02: Bidirectional Dependencies (FR-009)

**Files**: `src/types/schemas.ts`, `src/operations/task.ts`, `tests/task-operations.test.ts`
**Dependencies**: None
**Prompt**: `tasks/WP02-bidirectional-dependencies.md`

| Subtask | Description                                                                       |
| ------- | --------------------------------------------------------------------------------- |
| T006    | Add `blocks: z.array(z.string()).default([])` to `TaskSchema`                     |
| T007    | Update `createTask()` to add new task ID to each dependency's `blocks` array      |
| T008    | Update `deleteTask()` to remove deleted task ID from other tasks' `blocks` arrays |
| T009    | Update `updateTask()` to sync `blocks` when `dependencies` change                 |
| T010    | Add bidirectional dependency tests to `tests/task-operations.test.ts`             |

### WP03: Status Transitions + Cascade Unblocking (FR-010 + FR-011)

**Files**: `src/operations/task.ts`, `tests/status-transitions.test.ts`, `tests/cascade-unblock.test.ts`, `tests/task-operations.test.ts`
**Dependencies**: WP02
**Prompt**: `tasks/WP03-status-transitions-cascade.md`

| Subtask | Description                                                               |
| ------- | ------------------------------------------------------------------------- |
| T011    | Define `VALID_TRANSITIONS` map and add transition guard in `updateTask()` |
| T012    | Implement cascade unblock logic in `updateTask()` on task completion      |
| T013    | Create `tests/status-transitions.test.ts`                                 |
| T014    | Create `tests/cascade-unblock.test.ts`                                    |

### WP04: Integration and Stress Tests

**Files**: `tests/concurrency-stress.test.ts`, `tests/e2e-scenarios.test.ts`
**Dependencies**: WP01, WP02, WP03
**Prompt**: `tasks/WP04-integration-stress-tests.md`

| Subtask | Description                                                            |
| ------- | ---------------------------------------------------------------------- |
| T015    | Create `tests/concurrency-stress.test.ts` with multi-process scenarios |
| T016    | Create `tests/e2e-scenarios.test.ts` for P1-P4 acceptance criteria     |
| T017    | Final FR compliance validation against `quickstart.md`                 |

## Sizing Summary

| WP        | Subtasks | Source Files | Test Files             | Estimated Effort |
| --------- | -------- | ------------ | ---------------------- | ---------------- |
| WP01      | 5        | 2            | 1 (new)                | Small-Medium     |
| WP02      | 5        | 2            | 1 (modify)             | Small-Medium     |
| WP03      | 4        | 1            | 2 (new) + 1 (modify)   | Medium           |
| WP04      | 3        | 0            | 2 (new)                | Medium           |
| **Total** | **17**   | **3 unique** | **5 new + 1 modified** |                  |

## Breaking Change Analysis

**None.** All schema changes use `.default()` for backward compatibility. Forward-only
status transitions are the only behavioral change, and existing tests that skip
`pending -> in_progress` must be updated (documented in WP03 prompt).

## Existing Test Impact

The following existing test will need updating when WP03 is implemented:

- `tests/task-operations.test.ts` line 296-313: `updateTask` test goes `pending -> completed`
  directly. After FR-011, this must go `pending -> in_progress -> completed`.
- `tests/task-operations.test.ts` lines 260, 261, 275, 493, 695, 696: `areDependenciesMet`
  and lifecycle tests use `updateTask(... { status: 'completed' })` on pending tasks.
  These must first transition through `in_progress`.
