---
work_package_id: WP02
title: Storage Paths and Color Pool
lane: "doing"
dependencies: []
base_branch: main
base_commit: 28ecfd1a59462c40da5538af4f043693b723620e
created_at: '2026-02-10T06:28:52.158900+00:00'
subtasks:
- T007
- T008
- T009
- T010
- T011
- T012
- T013
phase: Phase 1 - Foundation
assignee: ''
agent: ''
shell_pid: "1368003"
review_status: ''
reviewed_by: ''
history:
- timestamp: '2026-02-10T06:00:00Z'
  lane: planned
  agent: system
  action: Prompt generated via /spec-kitty.tasks
---
# Work Package Prompt: WP02 – Storage Paths and Color Pool

## Objective

Extend `src/utils/storage-paths.ts` with new path resolution functions for agent state files, server state files, and the color pool. Create a new `src/utils/color-pool.ts` module with the color palette, allocation, and release logic. Add unit tests for both.

## Context

### Codebase Location
- **Primary target**: `src/utils/storage-paths.ts` (EXTEND)
- **New module**: `src/utils/color-pool.ts` (CREATE)
- **Re-export**: `src/utils/index.ts` (EXTEND — if barrel exists; create if not)
- **Test files**: `tests/storage-paths-agent.test.ts` (CREATE), `tests/color-pool.test.ts` (CREATE)
- **Data model reference**: `kitty-specs/002-agent-lifecycle-spawning/data-model.md` (Storage Path Extensions, lines 292–324; ColorAssignment, lines 257–290)

### Existing Pattern in `storage-paths.ts`
All path functions follow this pattern:
```typescript
export function getXxxDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'xxx');
  ensureDir(dir);
  return dir;
}
```
- Functions accept optional `projectRoot` parameter (falls back to `detectProjectRoot()`)
- Directory functions call `ensureDir()` to auto-create
- File path functions do NOT call `ensureDir()` (callers handle directory creation)
- Lock path functions return `.lock` inside the relevant directory

### Existing Test Pattern
See `tests/storage-paths.test.ts` for the established pattern:
- Uses `beforeAll` to set `process.env.OPENCODE_PROJECT_ROOT` to a temp dir
- Uses `afterAll` to clean up temp dir
- Tests verify paths include correct segments and directories are created

## Subtasks

### T007: Add agent directory/file/lock path functions

Add to `src/utils/storage-paths.ts` after the existing `getTaskFilePath()` function:

```typescript
/**
 * Get the agents directory within project storage.
 * <project-root>/.opencode/opencode-teams/agents/
 */
export function getAgentsDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'agents');
  ensureDir(dir);
  return dir;
}

/**
 * Get the state file path for a specific agent.
 * <project-root>/.opencode/opencode-teams/agents/<agent-id>.json
 */
export function getAgentStatePath(agentId: string, projectRoot?: string): string {
  return join(getAgentsDir(projectRoot), `${agentId}.json`);
}

/**
 * Get the lock file path for agent state operations.
 * <project-root>/.opencode/opencode-teams/agents/.lock
 */
export function getAgentLockPath(projectRoot?: string): string {
  return join(getAgentsDir(projectRoot), '.lock');
}
```

### T008: Add server directory/file/log path functions

Add to `src/utils/storage-paths.ts`:

```typescript
/**
 * Get the servers directory within project storage.
 * <project-root>/.opencode/opencode-teams/servers/
 */
export function getServersDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'servers');
  ensureDir(dir);
  return dir;
}

/**
 * Get the state file path for a specific server instance.
 * <project-root>/.opencode/opencode-teams/servers/<project-hash>/server.json
 */
export function getServerStatePath(projectHash: string, projectRoot?: string): string {
  const dir = join(getServersDir(projectRoot), projectHash);
  ensureDir(dir);
  return join(dir, 'server.json');
}

/**
 * Get the log file path for a specific server instance.
 * <project-root>/.opencode/opencode-teams/servers/<project-hash>/server.log
 */
export function getServerLogPath(projectHash: string, projectRoot?: string): string {
  const dir = join(getServersDir(projectRoot), projectHash);
  ensureDir(dir);
  return join(dir, 'server.log');
}
```

### T009: Add color pool path function

Add to `src/utils/storage-paths.ts`:

```typescript
/**
 * Get the color pool state file path.
 * <project-root>/.opencode/opencode-teams/color-pool.json
 */
export function getColorPoolPath(projectRoot?: string): string {
  return join(getProjectStorageDir(projectRoot), 'color-pool.json');
}
```

### T010: Create `color-pool.ts`

Create `src/utils/color-pool.ts` with:

1. **`COLOR_PALETTE`**: 10 visually distinct hex colors as a `const` array
2. **`ColorPoolSchema`**: Zod schema for `{ assignments: Record<string, string>, lastUpdated: string }`
3. **`allocateColor(agentId, projectRoot?)`**: Reads pool from disk, assigns next available color, writes atomically. If all colors in use, falls back to least-recently-used from inactive agents. If all agents are active and all colors taken, generates deterministic fallback from agent ID hash.
4. **`releaseColor(agentId, projectRoot?)`**: Removes agent's color assignment from pool, writes atomically.

```typescript
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readValidatedJSON, writeAtomicJSON } from './fs-atomic';
import { withLock } from './file-lock';
import { getColorPoolPath } from './storage-paths';

export const COLOR_PALETTE = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Sky Blue
  '#96CEB4', // Sage Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Lavender
  '#85C1E9', // Light Blue
] as const;

export const ColorPoolSchema = z.object({
  assignments: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  lastUpdated: z.string().datetime(),
});

export type ColorPool = z.infer<typeof ColorPoolSchema>;
```

**Implementation requirements**:
- Lock the color pool file during allocation/release using `withLock()` or `lockedUpsert()` pattern
- The lock path should be derived from the color pool path (e.g., `getColorPoolPath() + '.lock'`)
- When pool doesn't exist on disk, create with empty assignments
- `allocateColor` returns the hex color string assigned
- `releaseColor` is idempotent (no-op if agent has no assignment)
- Fallback color generation: `createHash('md5').update(agentId).digest('hex').slice(0, 6)` → prefix with `#`

### T011: Re-export from `utils/index.ts`

Check if `src/utils/index.ts` exists. If yes, add exports for the new color-pool module. If not, create it with barrel exports.

```typescript
export { COLOR_PALETTE, ColorPoolSchema, allocateColor, releaseColor } from './color-pool';
export type { ColorPool } from './color-pool';
```

### T012: Add unit tests for new storage path functions

Create `tests/storage-paths-agent.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tests should verify:
// 1. getAgentsDir returns correct path and creates directory
// 2. getAgentStatePath returns path with agent ID in filename
// 3. getAgentLockPath returns .lock inside agents directory
// 4. getServersDir returns correct path and creates directory
// 5. getServerStatePath creates project-hash subdirectory
// 6. getServerLogPath creates project-hash subdirectory
// 7. getColorPoolPath returns correct path at project storage root
```

Follow the pattern from `tests/storage-paths.test.ts`: set `process.env.OPENCODE_PROJECT_ROOT` to a temp dir.

### T013: Add unit tests for color pool

Create `tests/color-pool.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'bun:test';

// Tests should verify:
// 1. allocateColor assigns first available color from palette
// 2. Successive allocations assign different colors
// 3. releaseColor frees the color for reuse
// 4. Allocating after release reuses the released color
// 5. Exhaustion fallback: when all 10 colors assigned, generates from hash
// 6. ColorPoolSchema validates correctly (valid/invalid inputs)
// 7. allocateColor is idempotent (same agent gets same color on re-call)
// 8. releaseColor is idempotent (no error on releasing unassigned agent)
```

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] All new path functions follow existing `storage-paths.ts` patterns exactly
- [ ] `getAgentsDir`, `getServersDir` call `ensureDir()` (directory functions)
- [ ] `getAgentStatePath`, `getColorPoolPath` do NOT call `ensureDir()` (file path functions)
- [ ] `getServerStatePath`, `getServerLogPath` create their subdirectory via `ensureDir()`
- [ ] Color pool uses atomic writes and advisory locking
- [ ] All 10 colors in `COLOR_PALETTE` are unique hex values
- [ ] `bun test tests/storage-paths-agent.test.ts` passes
- [ ] `bun test tests/color-pool.test.ts` passes
- [ ] Existing tests still pass: `bun test tests/storage-paths.test.ts`
