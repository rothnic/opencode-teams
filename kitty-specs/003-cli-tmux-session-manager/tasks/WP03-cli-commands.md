---
work_package_id: WP03
title: CLI Commands (launch, attach, detach, status)
lane: "done"
dependencies:
  - WP02
base_branch: main
base_commit: 11abdf2ae163723b0618125a6c84656a4671b47b
created_at: '2026-02-10T14:30:00+00:00'
subtasks:
  - T016
  - T017
  - T018
  - T019
  - T020
phase: Phase 3 - CLI Integration
assignee: ''
agent: "Antigravity"
shell_pid: "16625"
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
# Work Package Prompt: WP03 -- CLI Commands

## Objective

Add launch, attach, detach, destroy, and status commands to `src/cli.ts`.

## Subtasks

### T016: Add launch command
Detect existing or create new session with server + agent panes.

### T017: Add attach command
Attach terminal to existing project session.

### T018: Add detach command
Detach current client from session.

### T019: Add status command
Show overview of all active sessions with agent/task counts.

### T020: Update help text
Include new commands in help output.

## Verification

- `npx tsc --noEmit` passes
- CLI help text includes all new commands

## Activity Log

- 2026-02-10T14:47:14Z – Sisyphus – lane=done – Code already on main, committed
- 2026-02-10T15:16:09Z – Antigravity – shell_pid=16625 – lane=doing – Started review via workflow command
- 2026-02-10T15:19:31Z – Antigravity – shell_pid=16625 – lane=done – Review passed: all subtasks T016-T020 implemented on main, tests pass (372/372)
