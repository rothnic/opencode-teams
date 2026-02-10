---
work_package_id: WP04
title: Tmux Operations Extensions
lane: "done"
dependencies: []
base_branch: main
base_commit: 34b25804a106255042feec7a83556929c5326aef
created_at: '2026-02-10T06:29:13.333001+00:00'
subtasks:
- T021
- T022
- T023
- T024
- T025
- T026
- T027
phase: Phase 1 - Foundation
assignee: ''
agent: ''
shell_pid: "1368003"
review_status: "approved"
reviewed_by: "Nick Roth"
history:
- timestamp: '2026-02-10T06:00:00Z'
  lane: planned
  agent: system
  action: Prompt generated via /spec-kitty.tasks
---
# Work Package Prompt: WP04 – Tmux Operations Extensions

## Objective

Extend the existing `TmuxOperations` class in `src/operations/tmux.ts` with new methods required for agent lifecycle management: `splitWindow` (returning pane ID), `sendKeys`, `capturePaneOutput`, pane option get/set, `killPane`, `setPaneTitle`, and `isInsideTmux`.

## Context

### Codebase Location
- **Target file**: `src/operations/tmux.ts` (EXTEND — add methods to existing class)
- **Test file**: `tests/tmux-operations-ext.test.ts` (CREATE)
- **Existing test**: `tests/tmux-operations.test.ts` (must still pass)

### Existing `TmuxOperations` Class
The class uses static methods and `Bun.spawnSync` for tmux commands:

```typescript
export class TmuxOperations {
  static isTmuxInstalled(): boolean { ... }
  static listSessions(): string[] { ... }
  static startSession(sessionName: string): boolean { ... }
  static stopSession(sessionName: string): boolean { ... }
  static selectLayout(sessionName: string, layout: string): boolean { ... }
  static addPane(sessionName: string, command?: string): boolean { ... }
}
```

### Migration Note (plan.md R6)
The plan recommends using **Bun `$` shell API** instead of `Bun.spawnSync` for new methods. However, to maintain consistency with the existing class, you have two options:

1. **Preferred**: Use `Bun.spawnSync` for consistency with existing methods (synchronous, same patterns)
2. **Acceptable**: Use Bun `$` shell API for new methods if you also make them async

Choose option 1 unless there's a strong reason for async. The existing class is fully synchronous.

### Key tmux Flags
- `-PF '#{pane_id}'` — Print new pane ID after split (format: `%42`)
- `-t <target>` — Target pane/session
- `-c <directory>` — Start directory for new pane
- `@user_option` — Custom pane options (tmux user options start with `@`)

## Subtasks

### T021: Add `splitWindow(session, workdir)` returning pane ID

Split the current window in a tmux session and return the new pane ID.

```typescript
/**
 * Split window and return the new pane ID.
 * @returns pane ID string (e.g., "%42") or null on failure
 */
static splitWindow(sessionName: string, workingDir?: string): string | null {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  const args = ['tmux', 'split-window', '-t', sessionName, '-PF', '#{pane_id}'];
  if (workingDir) {
    args.push('-c', workingDir);
  }

  const proc = Bun.spawnSync(args);
  if (proc.exitCode !== 0) {
    return null;
  }

  return proc.stdout.toString().trim();
}
```

### T022: Add `sendKeys(paneId, command, enterKey)`

Send keystrokes to a tmux pane. Used to run `opencode attach` commands.

```typescript
/**
 * Send keys to a tmux pane.
 * @param paneId - Target pane (e.g., "%42")
 * @param keys - Keys/command to send
 * @param enterKey - Whether to append Enter keystroke (default: true)
 */
static sendKeys(paneId: string, keys: string, enterKey = true): boolean {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  const args = ['tmux', 'send-keys', '-t', paneId, keys];
  if (enterKey) {
    args.push('Enter');
  }

  const proc = Bun.spawnSync(args);
  return proc.exitCode === 0;
}
```

### T023: Add `capturePaneOutput(paneId, lines)`

Capture the visible output of a tmux pane. Used for context capture during session rotation.

```typescript
/**
 * Capture pane output.
 * @param paneId - Target pane
 * @param lines - Number of lines to capture (default: 100)
 * @returns Captured text or null on failure
 */
static capturePaneOutput(paneId: string, lines = 100): string | null {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  const proc = Bun.spawnSync([
    'tmux', 'capture-pane', '-t', paneId, '-p', '-S', `-${lines}`,
  ]);
  if (proc.exitCode !== 0) {
    return null;
  }

  return proc.stdout.toString();
}
```

### T024: Add pane option get/set

Custom tmux pane options for storing metadata (e.g., `@opencode_session_id`, `@agent_id`).

```typescript
/**
 * Set a custom option on a tmux pane.
 * Option names should start with '@' (tmux user option convention).
 */
static setPaneOption(paneId: string, key: string, value: string): boolean {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  const proc = Bun.spawnSync([
    'tmux', 'set-option', '-p', '-t', paneId, key, value,
  ]);
  return proc.exitCode === 0;
}

/**
 * Get a custom option from a tmux pane.
 * @returns Option value or null if not set
 */
static getPaneOption(paneId: string, key: string): string | null {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  const proc = Bun.spawnSync([
    'tmux', 'show-options', '-p', '-t', paneId, '-v', key,
  ]);
  if (proc.exitCode !== 0) {
    return null;
  }

  return proc.stdout.toString().trim() || null;
}
```

### T025: Add `killPane` and `setPaneTitle`

```typescript
/**
 * Kill a tmux pane.
 * @returns true if pane was killed successfully
 */
static killPane(paneId: string): boolean {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  const proc = Bun.spawnSync(['tmux', 'kill-pane', '-t', paneId]);
  return proc.exitCode === 0;
}

/**
 * Set the title of a tmux pane.
 * Format convention: {session}__{type}_{index}
 */
static setPaneTitle(paneId: string, title: string): boolean {
  if (!TmuxOperations.isTmuxInstalled()) {
    throw new Error('tmux is not installed');
  }

  // tmux uses select-pane -T to set pane title
  const proc = Bun.spawnSync(['tmux', 'select-pane', '-t', paneId, '-T', title]);
  return proc.exitCode === 0;
}
```

### T026: Add `isInsideTmux()`

Detect whether the current process is running inside a tmux session.

```typescript
/**
 * Check if the current process is running inside a tmux session.
 */
static isInsideTmux(): boolean {
  return !!process.env.TMUX;
}
```

### T027: Add unit tests

Create `tests/tmux-operations-ext.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';
import { TmuxOperations } from '../src/operations/tmux';

describe('TmuxOperations Extensions', () => {
  // Test isInsideTmux (can always test — just checks env var)
  describe('isInsideTmux', () => {
    it('returns boolean based on TMUX env var', () => {
      const result = TmuxOperations.isInsideTmux();
      expect(typeof result).toBe('boolean');
    });
  });

  // Conditional tests: skip if tmux is not installed
  // Use: const hasTmux = TmuxOperations.isTmuxInstalled();
  // describe.skipIf(!hasTmux)('splitWindow', () => { ... });

  // For tmux-dependent tests:
  // 1. Create a temp tmux session
  // 2. Test splitWindow returns pane ID (format: %\d+)
  // 3. Test sendKeys sends text to pane
  // 4. Test capturePaneOutput captures content
  // 5. Test setPaneOption / getPaneOption round-trip
  // 6. Test killPane removes the pane
  // 7. Clean up temp session
});
```

**Important**: Tmux tests should be conditionally skipped if tmux is not available. Use `describe.skipIf(!hasTmux)`.

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] All new methods are `static` (matches existing class pattern)
- [ ] All new methods check `isTmuxInstalled()` first and throw if not available
- [ ] `splitWindow` returns pane ID string via `-PF '#{pane_id}'`
- [ ] `sendKeys` appends `Enter` by default (configurable)
- [ ] `capturePaneOutput` returns string content (not just boolean)
- [ ] Pane options use `@` prefix convention for user options
- [ ] `isInsideTmux` checks `process.env.TMUX`
- [ ] Existing methods are NOT modified
- [ ] `bun test tests/tmux-operations.test.ts` still passes (no regressions)
- [ ] `bun test tests/tmux-operations-ext.test.ts` passes
- [ ] No `as any` or type suppression

## Activity Log

- 2026-02-10T14:34:38Z – unknown – shell_pid=1368003 – lane=for_review – Implementation complete, all 13 tests pass, tmux operations extensions ready
- 2026-02-10T14:36:37Z – unknown – shell_pid=1368003 – lane=done – Code verified on main, 357 tests pass
