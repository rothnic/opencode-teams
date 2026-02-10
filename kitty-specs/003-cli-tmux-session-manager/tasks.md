# Tasks: CLI and Tmux Session Manager

**Feature**: 003-cli-tmux-session-manager
**Date**: 2026-02-10
**Spec**: `kitty-specs/003-cli-tmux-session-manager/spec.md`
**Plan**: `kitty-specs/003-cli-tmux-session-manager/plan.md`

## Overview

30 subtasks grouped into 6 work packages. All changes are additive (new module, schema
extensions, CLI command additions). No new runtime dependencies.

## Dependency Graph

```
WP01 (Schemas/Paths) --+--> WP02 (SessionManager) --+--> WP03 (CLI Commands)
                        |                             |
                        |                             +--> WP04 (Dashboard)
                        |                             |
                        +-----------------------------+--> WP05 (Auto-Cleanup)
                                                      |
                                                      +--> WP06 (Tests)
```

- WP01 is foundation (types, paths).
- WP02 depends on WP01.
- WP03, WP04, WP05 depend on WP02.
- WP06 depends on WP03-05.

## Work Packages

### WP01: CLIConfig Schema and Session Metadata Types

**Target**: `src/types/schemas.ts`, `src/types/index.ts`, `src/utils/storage-paths.ts`, `src/utils/index.ts`
**Dependencies**: None

| ID | Subtask | Target File |
|----|---------|-------------|
| T001 | Add `CLIConfigSchema` with layout, autoCleanup, paneMinWidth/Height, dashboardRefreshInterval | `src/types/schemas.ts` |
| T002 | Add `SessionMetadataSchema` with projectDir, sessionName, serverPaneId, agentPanes, createdAt, autoCleanupEnabled | `src/types/schemas.ts` |
| T003 | Add `PaneInfoSchema` with paneId, agentName, teamName, label | `src/types/schemas.ts` |
| T004 | Re-export new types (CLIConfig, SessionMetadata, PaneInfo) from `src/types/index.ts` | `src/types/index.ts` |
| T005 | Add `getSessionsDir()`, `getSessionMetadataPath(sessionName)` to storage-paths | `src/utils/storage-paths.ts` |
| T006 | Re-export new path functions from `src/utils/index.ts` | `src/utils/index.ts` |

### WP02: Session Manager Operations

**Target**: `src/operations/session-manager.ts`, `src/operations/index.ts`
**Dependencies**: WP01

| ID | Subtask | Target File |
|----|---------|-------------|
| T007 | Create `session-manager.ts` module with SessionManager class | `src/operations/session-manager.ts` |
| T008 | Implement `deriveSessionName(projectDir)` using crypto hash of path | `src/operations/session-manager.ts` |
| T009 | Implement `detectSession(projectDir)` checking tmux + metadata file | `src/operations/session-manager.ts` |
| T010 | Implement `launchSession(projectDir, teamName, config)` orchestrating tmux session + server + agent panes | `src/operations/session-manager.ts` |
| T011 | Implement `destroySession(sessionName)` with server stop, pane cleanup, metadata removal | `src/operations/session-manager.ts` |
| T012 | Implement `getSessionInfo(projectDir)` reading session metadata | `src/operations/session-manager.ts` |
| T013 | Implement `listActiveSessions()` enumerating metadata files cross-referenced with tmux | `src/operations/session-manager.ts` |
| T014 | Implement `checkAutoCleanup(sessionName)` checking all tasks completed + no attached clients | `src/operations/session-manager.ts` |
| T015 | Export SessionManager from `src/operations/index.ts` | `src/operations/index.ts` |

### WP03: CLI Commands (launch, attach, detach, status)

**Target**: `src/cli.ts`
**Dependencies**: WP02

| ID | Subtask | Target File |
|----|---------|-------------|
| T016 | Add `launch` command: detect existing or create new session with server + agent panes | `src/cli.ts` |
| T017 | Add `attach` command: attach terminal to existing project session | `src/cli.ts` |
| T018 | Add `detach` command: detach current client from session | `src/cli.ts` |
| T019 | Add `status` command: show overview of all active sessions with agent/task counts | `src/cli.ts` |
| T020 | Update help text with new commands | `src/cli.ts` |

### WP04: Dashboard Command

**Target**: `src/cli.ts`
**Dependencies**: WP02

| ID | Subtask | Target File |
|----|---------|-------------|
| T021 | Add `dashboard` command rendering task progress bars, agent states, recent messages | `src/cli.ts` |
| T022 | Implement dashboard refresh loop with configurable interval (default 3s) | `src/cli.ts` |
| T023 | Handle no-active-session case with clear user message | `src/cli.ts` |

### WP05: Auto-Cleanup Integration

**Target**: `src/index.ts`, `src/operations/session-manager.ts`
**Dependencies**: WP02

| ID | Subtask | Target File |
|----|---------|-------------|
| T024 | Wire `checkAutoCleanup()` into `session.idle` hook in plugin | `src/index.ts` |
| T025 | Add cleanup check after task completion events (update-task to completed) | `src/index.ts` |
| T026 | Implement auto-cleanup config toggle (respect CLIConfig.autoCleanup) | `src/operations/session-manager.ts` |

### WP06: Tests

**Target**: `tests/`
**Dependencies**: WP02-WP05

| ID | Subtask | Target File |
|----|---------|-------------|
| T027 | Test SessionManager.deriveSessionName determinism and uniqueness | `tests/session-manager.test.ts` |
| T028 | Test SessionManager.detectSession with mock tmux | `tests/session-manager.test.ts` |
| T029 | Test SessionManager metadata read/write with Zod validation | `tests/session-manager.test.ts` |
| T030 | Test CLI command argument parsing and error handling | `tests/cli-commands.test.ts` |

## Sizing Summary

| WP | Subtasks | Source Files | Test Files | Estimated Effort |
|----|----------|-------------|------------|------------------|
| WP01 | 6 | 4 | 0 | Small |
| WP02 | 9 | 2 | 0 | Medium |
| WP03 | 5 | 1 | 0 | Medium |
| WP04 | 3 | 1 | 0 | Small |
| WP05 | 3 | 2 | 0 | Small |
| WP06 | 4 | 0 | 2 | Medium |
| **Total** | **30** | **6 unique** | **2 new** | |

## Breaking Change Analysis

**None.** All CLI changes are additive (new commands). Existing commands (list, start, stop,
layout, add-pane) remain unchanged. Schema additions use `.default()` for backward compatibility.
