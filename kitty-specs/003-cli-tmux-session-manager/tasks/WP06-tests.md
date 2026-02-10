---
work_package_id: WP06
title: Tests
lane: "done"
dependencies:
  - WP02
  - WP03
  - WP04
  - WP05
base_branch: main
base_commit: 11abdf2ae163723b0618125a6c84656a4671b47b
created_at: '2026-02-10T14:30:00+00:00'
subtasks:
  - T027
  - T028
  - T029
  - T030
phase: Phase 4 - Verification
assignee: ''
agent: "Reviewer"
shell_pid: ''
review_status: "approved"
reviewed_by: "Nick Roth"
history:
  - timestamp: '2026-02-10T14:30:00Z'
    lane: planned
    agent: system
    action: Prompt generated via /spec-kitty.tasks
---
# Work Package Prompt: WP06 -- Tests

## Objective

Write unit tests for SessionManager operations and CLI command behavior.

## Context

### Codebase Location
- **SessionManager**: `src/operations/session-manager-cli.ts`
- **CLI**: `src/cli.ts`
- **Types**: `src/types/schemas.ts` (CLIConfigSchema, SessionMetadataSchema, PaneInfoSchema)
- **Paths**: `src/utils/storage-paths.ts` (getSessionsDir, getSessionMetadataPath)

### Test Patterns to Follow
- Use `bun:test` (`describe`, `it`, `expect`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`)
- See existing tests: `tests/team-operations.test.ts`, `tests/agent-operations.test.ts`
- Use temp directories for file operations
- Mock tmux commands (they won't be available in CI)

## Subtasks

### T027: Test SessionManager.deriveSessionName determinism and uniqueness
**File**: `tests/session-manager.test.ts`
- Same input always produces same output
- Different inputs produce different outputs
- Output format matches `oc-<dirName>-<hash>` pattern

### T028: Test SessionManager.detectSession with mock tmux
**File**: `tests/session-manager.test.ts`
- Returns null when no metadata file exists
- Returns metadata when file exists and tmux session is active
- Cleans up metadata when tmux session is gone

### T029: Test SessionManager metadata read/write with Zod validation
**File**: `tests/session-manager.test.ts`
- Write metadata, read it back, verify structure
- Invalid metadata fails validation
- Default values applied correctly (autoCleanupEnabled, agentPanes)

### T030: Test CLI command argument parsing and error handling
**File**: `tests/cli-commands.test.ts`
- Help command produces expected output
- Unknown commands produce error
- Commands without required args produce error messages

## Verification

- `bun test tests/session-manager.test.ts` passes
- `bun test tests/cli-commands.test.ts` passes
- All existing tests still pass: `bun test`

## Activity Log

- 2026-02-10T14:48:14Z – Implementer – lane=doing – Delegating to subagent for test implementation
- 2026-02-10T14:55:45Z – Implementer – lane=for_review – Tests implemented and passing
- 2026-02-10T14:59:50Z – Reviewer – lane=done – Approved: all subtasks covered, 372 tests pass
