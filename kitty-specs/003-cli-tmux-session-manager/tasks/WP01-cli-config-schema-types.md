---
work_package_id: WP01
title: CLIConfig Schema and Session Metadata Types
lane: "done"
dependencies: []
base_branch: main
base_commit: 11abdf2ae163723b0618125a6c84656a4671b47b
created_at: '2026-02-10T14:30:00+00:00'
subtasks:
  - T001
  - T002
  - T003
  - T004
  - T005
  - T006
phase: Phase 1 - Foundation
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
# Work Package Prompt: WP01 -- CLIConfig Schema and Session Metadata Types

## Objective

Add `CLIConfigSchema`, `SessionMetadataSchema`, and `PaneInfoSchema` to `src/types/schemas.ts`. Add session path helpers to `src/utils/storage-paths.ts`. Re-export from barrel files.

## Subtasks

### T001: Add CLIConfigSchema
**File**: `src/types/schemas.ts`
Add schema with layout, autoCleanup, paneMinWidth/Height, dashboardRefreshInterval.

### T002: Add SessionMetadataSchema
**File**: `src/types/schemas.ts`
Add schema with projectDir, sessionName, serverPaneId, agentPanes, createdAt, autoCleanupEnabled.

### T003: Add PaneInfoSchema
**File**: `src/types/schemas.ts`
Add schema with paneId, agentName, teamName, label.

### T004: Re-export new types
**File**: `src/types/index.ts`
Re-export CLIConfig, SessionMetadata, PaneInfo types and schemas.

### T005: Add session path helpers
**File**: `src/utils/storage-paths.ts`
Add `getSessionsDir()` and `getSessionMetadataPath(sessionName)`.

### T006: Re-export new path functions
**File**: `src/utils/index.ts`
Re-export `getSessionsDir` and `getSessionMetadataPath`.

## Verification

- `npx tsc --noEmit` passes
- All new types are importable from `src/types/index.ts`
- All new path functions are importable from `src/utils/index.ts`

## Activity Log

- 2026-02-10T14:47:13Z – Sisyphus – lane=done – Code already on main, committed
