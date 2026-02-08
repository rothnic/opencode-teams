# Ralph Progress Log

This file tracks progress across iterations. Agents update this file
after each iteration and it's included in prompts for context.

## Codebase Patterns (Study These First)

- **Truly Synchronous JSON IO**: When synchronous file operations are required (e.g., in existing sync functions), use `node:fs`'s `readFileSync` and `writeFileSync` instead of Bun's `file` APIs, as Bun's `file.text()` and `Bun.write()` are asynchronous and return Promises.
- **Bun Sleep**: Prefer `await Bun.sleep(ms)` over `setTimeout` for delays in Bun environments.

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
