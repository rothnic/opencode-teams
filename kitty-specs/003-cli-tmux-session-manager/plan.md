# Implementation Plan: CLI and Tmux Session Manager

**Branch**: `003-cli-tmux-session-manager` | **Date**: 2026-02-10 | **Spec**: `kitty-specs/003-cli-tmux-session-manager/spec.md`

## Summary

Extend the existing CLI (`src/cli.ts`) with project-aware session management, agent lifecycle commands, a real-time dashboard, and auto-cleanup. The CLI already has basic tmux commands (list, start, stop, layout, add-pane). Feature 003 adds higher-level orchestration: launching full team sessions with server + agent panes, attaching/detaching, monitoring via dashboard, and automatic cleanup.

## Technical Context

**Language/Version**: TypeScript 5.3+ with `strict: true`
**Runtime**: Bun >= 1.3.2
**Existing Infrastructure**:
- `src/cli.ts`: Basic CLI with list/start/stop/layout/add-pane commands
- `src/operations/tmux.ts`: Full tmux operations (sessions, panes, layout, keys, options)
- `src/operations/agent.ts`: Agent spawn, kill, heartbeat, state management
- `src/operations/server-manager.ts`: OpenCode server lifecycle, session management
- `src/utils/storage-paths.ts`: File path utilities for agents, servers, teams
- `src/utils/index.ts`: `getAppConfig()` reads from `.opencode/opencode-teams/config.json`

**Dependencies**: No new runtime dependencies. Uses existing zod, Bun APIs.

## Constitution Check

| Rule | Status | Notes |
|------|--------|-------|
| TypeScript strict mode | PASS | No changes to tsconfig |
| Bun-first development | PASS | Uses Bun.spawnSync for tmux, Bun.file/write for config |
| Zod validation on I/O | PASS | CLIConfigSchema validates config reads |
| Minimal dependencies | PASS | No new dependencies |
| No type suppression | PASS | No `as any` in new code |
| Conventional commits | PASS | Will follow |
| File naming kebab-case | PASS | `session-manager.ts`, `cli-config.ts` |

## Gap Analysis

### Existing (no changes needed)

| FR | What | Implementation |
|----|------|----------------|
| FR-001 | CLI binary from any project dir | `package.json` bin -> `dist/cli.js` |
| FR-004 | Three layout types | `TmuxOperations.selectLayout()` supports tiled, main-vertical, even-horizontal |

### New Implementation Required

**FR-002: Session detection by project dir** (NEW)
- Need: `SessionManager.detectSession(projectDir)` that finds existing tmux session for a project
- Design: Derive deterministic session name from project path hash. Check `tmux has-session -t <name>`.
- Store session metadata in `.opencode/opencode-teams/sessions/<hash>.json`

**FR-003: Spawn coding server in tmux session** (NEW)
- Need: `launch` CLI command that creates tmux session, starts OpenCode server, spawns initial panes
- Design: Uses existing `ServerManager.ensureRunning()` + `TmuxOperations.startSession()`

**FR-005: Agent panes with name@team labels** (PARTIAL)
- Need: When spawning agent panes, set pane title to `name@team` format
- Design: Uses existing `TmuxOperations.setPaneTitle()` after `AgentOperations.spawnAgent()`

**FR-006: Auto-cleanup on session idle** (NEW)
- Need: Monitor task completion; destroy session when all done + last client disconnects
- Design: New `SessionManager.checkAutoCleanup()` called from session.idle hook

**FR-007: Dashboard command** (NEW)
- Need: `dashboard` CLI command showing task progress, agents, messages
- Design: Terminal output using `AgentOperations.listAgents()`, `TaskOperations.getTasks()`, team messages

**FR-008: Attach/detach commands** (NEW)
- Need: `attach` and `detach` CLI commands
- Design: `tmux attach-session -t <name>` and `tmux detach-client -s <name>`

**FR-009: Status command** (NEW)
- Need: `status` CLI command showing all sessions overview
- Design: Enumerate session metadata files, query tmux state, show agents + task counts

**FR-010: Persist user preferences** (NEW)
- Need: CLIConfig schema for layout, auto-cleanup, pane sizing, dashboard refresh
- Design: Zod schema, read/write to `.opencode/opencode-teams/config.json`

## Project Structure

### Source Code

```
src/
  operations/
    session-manager.ts    # NEW: Session lifecycle (detect, launch, destroy, cleanup)
    index.ts              # EXTEND: Export SessionManager
  types/
    schemas.ts            # EXTEND: CLIConfigSchema, SessionMetadataSchema
    index.ts              # EXTEND: Re-export new types
  utils/
    storage-paths.ts      # EXTEND: Session metadata paths
    index.ts              # EXTEND: Re-export new paths
  cli.ts                  # EXTEND: Add launch, attach, detach, status, dashboard commands

tests/
  session-manager.test.ts # NEW: Session detection, launch, destroy tests
  cli-commands.test.ts    # NEW: CLI command integration tests
```

## Work Packages

### WP01: CLIConfig Schema and Session Metadata Types
Add CLIConfigSchema with Zod validation and SessionMetadataSchema for persisting session state.
Extend storage-paths with session directory/file helpers.

### WP02: Session Manager Operations
Create `src/operations/session-manager.ts` with:
- `deriveSessionName(projectDir)` - deterministic name from path
- `detectSession(projectDir)` - check if session exists
- `launchSession(projectDir, config)` - full orchestration
- `destroySession(sessionName)` - clean teardown
- `getSessionInfo(projectDir)` - read session metadata
- `listActiveSessions()` - enumerate all sessions
- `checkAutoCleanup(sessionName)` - cleanup eligibility check

### WP03: CLI Commands (launch, attach, detach, status)
Extend `src/cli.ts` with new commands that use SessionManager + existing operations.

### WP04: Dashboard Command
Add `dashboard` command that displays real-time task/agent/message overview in terminal.

### WP05: Auto-Cleanup Integration
Wire `checkAutoCleanup()` into the plugin's `session.idle` hook and post-task-completion events.

### WP06: Tests
Unit tests for SessionManager operations and CLI command behavior.

## Complexity Tracking

No constitution violations. All changes extend existing patterns.
No new dependencies. No structural changes.
