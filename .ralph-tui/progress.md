# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Truly Synchronous JSON IO**: When synchronous file operations are required (e.g., in existing sync functions), use `node:fs`'s `readFileSync` and `writeFileSync` instead of Bun's `file` APIs, as Bun's `file.text()` and `Bun.write()` are asynchronous and return Promises.
- **Bun Sleep**: Prefer `await Bun.sleep(ms)` over `setTimeout` for delays in Bun environments.
- **Soft Blocking Pattern**: When implementing coordination tools that depend on other states (like task dependencies), use a "Soft Blocking" approach. This means checking the condition and returning a warning in the result instead of throwing a hard error, allowing agents to decide whether to proceed based on the warning.
- **Tmux Layout Preservation**: When adding panes to a Tmux session, always re-apply the desired layout (e.g., `tiled`) immediately after adding the pane to maintain a consistent visual arrangement.

---

## 2026-02-08 - ralph-tui-us005

- Implemented `opencode-teams` CLI tool for Tmux session management.
- Added `TmuxOperations` for `list`, `start`, and `stop` commands using `Bun.spawnSync`.
- Exported `opencode-teams` binary in `package.json`.
- Added comprehensive tests for Tmux operations with `Bun.spawnSync` mocking.
- Files changed:
  - `src/operations/tmux.ts`: Core Tmux management logic.
  - `src/cli.ts`: CLI entry point with argument parsing.
  - `package.json`: Added `bin` field for the CLI tool.
  - `tests/tmux-operations.test.ts`: Unit tests for Tmux operations.
- **Learnings:**
  - **Bun spawnSync:** Using `Bun.spawnSync` is an efficient way to interact with system commands like `tmux`. It returns an object with `exitCode`, `stdout`, and `stderr`, making it easy to handle success and failure cases.
  - **Shebang Preservation:** `tsc` preserves the shebang (`#!/usr/bin/env bun`) at the top of the file when compiling from `.ts` to `.js`, which is essential for executable CLI tools.
  - **Mocking Bun APIs:** `spyOn(Bun, 'spawnSync')` works well for mocking system calls in Bun tests, allowing for controlled testing of CLI logic without requiring the actual external tools (like tmux) to be present or modified during tests.

---

## 2026-02-08 - ralph-tui-us003

- Implemented task dependency tracking and validation.
- Enhanced Task CRUD operations with dependency checks.
- Added circular dependency detection.
- Prevented claiming tasks until all dependencies are completed.
- Prevented deleting tasks that are dependencies for other tasks.
- Files changed:
  - `src/types/index.ts`: Added `dependencies` field to `Task` interface.
  - `src/operations/task.ts`: Implemented `getTask`, `deleteTask`, `areDependenciesMet`, and `checkCircularDependency`. Updated `createTask`, `updateTask`, and `claimTask` to handle dependencies.
  - `tests/task-operations.test.ts`: Added comprehensive tests for task dependencies and validation.
- **Learnings:**
  - **Circular Dependency Detection:** When checking for circular dependencies during an update, you must account for the "pending" state of the task being updated, as disk-based reads will only show the old state. Checking if a dependency exists in the current `visited` set before recursing is an effective way to detect cycles.
  - **CRUD Integrity:** Enforcing referential integrity (preventing deletion of tasks that are dependencies) is crucial for a stable task system.

---

## 2026-02-08 - ralph-tui-us004

- Implemented Soft Blocking in `claim_task` tool.
- Replaced hard failure for unmet dependencies with a warning message.
- Updated `Task` interface to explicitly include a `warning` field.
- Updated `TaskOperations.claimTask` to set a warning when dependencies are not met.
- Files changed:
  - `src/types/index.ts`: Added `warning` field to `Task` interface.
  - `src/operations/task.ts`: Modified `claimTask` to implement soft blocking with warnings.
  - `tests/task-operations.test.ts`: Updated tests to verify soft blocking behavior and warning persistence.
- **Learnings:**
  - **Soft Blocking Pattern:** Implementing "Soft Blocking" allows for more flexible agent coordination where agents can be notified of potential issues (like unmet dependencies) without being strictly prevented from proceeding if they deem it necessary.
  - **Task Metadata:** Adding a `warning` field to the task itself is an effective way to communicate non-fatal issues that persist across tool calls.

---

## 2026-02-08 - ralph-tui-us002

- Fixed and verified `poll_inbox` tool with long-polling support.
- Fixed messaging persistence by correcting broken synchronous JSON read/write operations.
- Updated `TeamOperations.pollInbox` to use `Bun.sleep`.
- Resolved linting and typechecking issues across the codebase.
- Files changed:
  - `src/utils/index.ts`: Fixed `safeReadJSONSync` and `writeJSONSync`.
  - `src/operations/team.ts`: Fixed `pollInbox` to use `Bun.sleep`.
  - `src/index.ts`: Removed unused imports and fixed typecheck issues.
  - `tests/poll-inbox.test.ts`: Updated tests to use `Bun.sleep` and fixed linting.
- **Learnings:**
  - **Bun Async Gotcha:** `Bun.file(path).text()` and `Bun.write()` are asynchronous. Attempting to use them in a synchronous function without awaiting will result in the string `"[object Promise]"` being processed, leading to `SyntaxError` when parsing JSON.
  - **Typecheck Fallback:** When using optional peer dependencies, use `// @ts-expect-error` for the import to allow `tsc` to pass even if the dependency is missing.

---

## 2026-02-08 - ralph-tui-us007

- Implemented graceful shutdown protocol with `request-shutdown` and `approve-shutdown` tools.
- Added `session.idle` hook for fallback maintenance and cleanup.
- Added `postinstall` script to `package.json` for binary linking and build automation.
- Updated `TeamConfig` type to track shutdown approvals.
- Added comprehensive lifecycle tests in `tests/lifecycle.test.ts`.
- Files changed:
  - `src/types/index.ts`: Added `shutdownApprovals` to `TeamConfig`.
  - `src/operations/team.ts`: Implemented `requestShutdown`, `approveShutdown`, and `shouldShutdown`.
  - `src/index.ts`: Registered new shutdown tools and `session.idle` hook.
  - `package.json`: Added `postinstall` script.
  - `tests/lifecycle.test.ts`: New tests for shutdown logic.
- **Learnings:**
  - **Graceful Shutdown:** Implementing a multi-agent approval system for shutdown ensures that all agents are ready before resources are cleaned up. Leader approval or unanimous member approval provides a flexible but safe exit strategy.
  - **OpenCode Hooks:** The `session.idle` hook is a powerful place for maintenance tasks like cleaning up abandoned team data or stale locks.
  - **Binary Permissions:** In Bun/Node environments, ensuring that `dist/` binaries are executable (`chmod +x`) during `postinstall` is crucial for a smooth user experience when installing via git or local links.

---
