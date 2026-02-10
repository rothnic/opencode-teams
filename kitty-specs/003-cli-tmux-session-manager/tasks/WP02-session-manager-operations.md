---
work_package_id: WP02
title: Session Manager Operations
lane: "done"
dependencies:
  - WP01
base_branch: main
base_commit: 11abdf2ae163723b0618125a6c84656a4671b47b
created_at: '2026-02-10T14:30:00+00:00'
subtasks:
  - T007
  - T008
  - T009
  - T010
  - T011
  - T012
  - T013
  - T014
  - T015
phase: Phase 2 - Core Operations
assignee: ''
agent: "Sisyphus"
shell_pid: ''
review_status: 'approved'
reviewed_by: 'Sisyphus'
history:
  - timestamp: '2026-02-10T14:30:00Z'
    lane: planned
    agent: system
    action: Prompt generated via /spec-kitty.tasks
  - timestamp: '2026-02-10T14:30:00Z'
    lane: done
    agent: Sisyphus
    action: Code already implemented in working directory
---
# Work Package Prompt: WP02 -- Session Manager Operations

## Objective

Create `src/operations/session-manager-cli.ts` with full SessionManager class implementing session lifecycle management. Export from `src/operations/index.ts`.

## Subtasks

### T007: Create session-manager-cli.ts module
**File**: `src/operations/session-manager-cli.ts`

### T008: Implement deriveSessionName(projectDir)
Uses crypto hash of path for deterministic naming.

### T009: Implement detectSession(projectDir)
Check tmux + metadata file existence.

### T010: Implement launchSession(projectDir, teamName, config)
Orchestrate tmux session + server + agent panes.

### T011: Implement destroySession(sessionName)
Server stop, pane cleanup, metadata removal.

### T012: Implement getSessionInfo(projectDir)
Read session metadata from disk.

### T013: Implement listActiveSessions()
Enumerate metadata files cross-referenced with tmux.

### T014: Implement checkAutoCleanup(sessionName)
Check all tasks completed + no attached clients.

### T015: Export SessionManager from operations/index.ts
**File**: `src/operations/index.ts`

## Verification

- `npx tsc --noEmit` passes
- SessionManager is importable from `src/operations/index.ts`

## Activity Log

- 2026-02-10T14:47:14Z – Sisyphus – lane=done – Code already on main, committed
