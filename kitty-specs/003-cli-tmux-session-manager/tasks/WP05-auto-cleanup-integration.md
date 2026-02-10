---
work_package_id: WP05
title: Auto-Cleanup Integration
lane: "done"
dependencies:
  - WP02
base_branch: main
base_commit: 11abdf2ae163723b0618125a6c84656a4671b47b
created_at: '2026-02-10T14:30:00+00:00'
subtasks:
  - T024
  - T025
  - T026
phase: Phase 3 - CLI Integration
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
# Work Package Prompt: WP05 -- Auto-Cleanup Integration

## Objective

Wire `checkAutoCleanup()` into the plugin's session.idle hook and post-task-completion events in `src/index.ts`.

## Subtasks

### T024: Wire checkAutoCleanup into session.idle hook
**File**: `src/index.ts`

### T025: Add cleanup check after task completion events
**File**: `src/index.ts`

### T026: Implement auto-cleanup config toggle
**File**: `src/operations/session-manager-cli.ts`
Respect CLIConfig.autoCleanup setting.

## Verification

- `npx tsc --noEmit` passes
- Auto-cleanup wired into session idle event handler

## Activity Log

- 2026-02-10T14:47:15Z – Sisyphus – lane=done – Code already on main, committed
