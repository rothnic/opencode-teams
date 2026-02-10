# Research: Robust Coordination Core

**Feature**: 001-robust-coordination-core
**Date**: 2026-02-10
**Sources**: Codebase analysis, Claude Code TeammateTool research, Bun FFI documentation

## Research Questions

### R1: What concurrency model should we use?

**Decision**: Keep existing advisory file locking via Bun FFI fcntl()

**Rationale**:

- Already implemented and tested in `src/utils/file-lock.ts`
- Uses POSIX fcntl(F_SETLKW) for blocking locks and fcntl(F_SETLK) for non-blocking try-acquire
- Supports both exclusive (write) and shared (read) locks
- Automatic cleanup via `withLock()`/`withLockAsync()` RAII pattern
- Claude Code uses the same approach (file-based locks for team config and task files)

**Alternatives Considered**:

- **Lockfile sentinel files**: Simpler but weaker guarantees (no blocking, no shared locks)
- **bun:sqlite WAL mode**: Stronger transactional guarantees, but changes storage model entirely
- **Yjs/CRDT**: Eventual consistency model - deferred to future feature; overkill for current scope
- **In-memory locks**: Only works single-process; agents run as separate processes

### R2: How does Claude Code handle structured messages?

**Decision**: Add `type` field to MessageSchema with backward-compatible default

**Rationale**:
Claude Code's TeammateTool has 13 operations including `requestShutdown`, `approveShutdown`,
`approvePlan`, `rejectPlan`. These are separate tool operations, not message types.
However, the spec calls for message types to carry semantic meaning in the inbox.

Our approach: messages carry a `type` field so agents can filter inbox by type and react
accordingly. The `type` has a `.default('plain')` so existing inbox JSON files on disk
(which lack the field) remain valid.

**Alternatives Considered**:

- **Separate tool operations** (like Claude Code): Rejected because our spec explicitly
  requires structured message types (FR-005)
- **Discriminated union schemas** (one schema per type): Over-engineered for current scope;
  a single schema with a type enum is sufficient

### R3: How should bidirectional dependencies work?

**Decision**: Denormalized `blocks` field maintained alongside `dependencies`

**Rationale**:

- `dependencies` = "I am blocked by these tasks" (blocked_by semantics)
- `blocks` = "I block these tasks" (reverse index)
- File-based storage makes computed views expensive (must scan all task files)
- Denormalized `blocks` array avoids full scans when checking what a task blocks
- Claude Code uses both `blockedBy` and `dependencies` fields on tasks

**Alternatives Considered**:

- **Computed `blocks` on read**: Requires scanning all tasks every time; O(n) per read
- **Single canonical direction**: Simpler but doesn't meet spec requirement for bidirectional fields

### R4: How should cascade unblocking work?

**Decision**: Synchronous cascade within the same lock acquisition on task completion

**Rationale**:

- When `updateTask(teamName, taskId, { status: 'completed' })` is called, the function
  already holds the task lock. Within that lock scope, scan other tasks and remove the
  completed task ID from their `dependencies` arrays.
- This is safe because all tasks share a single lock file per team (`getTaskLockPath()`)
- No new lock acquisition needed - the cascade runs in the same critical section

**Alternatives Considered**:

- **Async event-based cascade**: More complex, introduces ordering issues
- **Lazy cascade on next read**: Doesn't meet spec ("automatically remove")
- **Background sweep**: Race conditions with new task creation

### R5: What does Claude Code's team coordination look like?

**Findings**:
Claude Code v2.1.19 TeammateTool (discovered via binary analysis) provides 13 operations:
`spawnTeam`, `discoverTeams`, `requestJoin`, `approveJoin`, `rejectJoin`, `write`,
`broadcast`, `requestShutdown`, `approveShutdown`, `rejectShutdown`, `approvePlan`,
`rejectPlan`, `cleanup`.

Storage structure:

```text
~/.claude/teams/<team-name>/config.json
~/.claude/teams/<team-name>/messages/<session-id>/
~/.claude/tasks/<team-name>/<task-id>.json
```

Our plugin already implements the core operations. Missing from Claude Code parity:

- Join approval workflow (approveJoin/rejectJoin) - out of scope for feature 001
- Plan approval system (approvePlan/rejectPlan) - out of scope for feature 001
- Reject shutdown (rejectShutdown) - minor addition, could be added with P2 work

### R6: What are the cross-platform considerations?

**Decision**: Linux and macOS only. Windows not supported for file locking.

**Rationale**:

- fcntl() is POSIX-only. The existing `ensurePosixPlatform()` guard throws on Windows.
- Bun FFI loads `libSystem.B.dylib` (macOS) or `libc.so.6` (Linux)
- This matches the constitution's stated platform support
- Claude Code also targets Linux/macOS (tmux integration)

**For Future**: If Windows support is needed, could use `LockFileEx()` via FFI or
switch to bun:sqlite which handles cross-platform locking internally.
