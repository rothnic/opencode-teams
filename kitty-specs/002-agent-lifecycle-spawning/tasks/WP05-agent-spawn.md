---
work_package_id: 'WP05'
title: 'Agent Spawn Operations'
lane: "for_review"
subtasks:
  - 'T028'
  - 'T029'
  - 'T030'
  - 'T031'
  - 'T032'
  - 'T033'
phase: 'Phase 2 - Core Operations'
assignee: ''
agent: ''
shell_pid: ''
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-02-10T06:00:00Z'
    lane: 'planned'
    agent: 'system'
    action: 'Prompt generated via /spec-kitty.tasks'
---
# Work Package Prompt: WP05 – Agent Spawn Operations

## Objective

Create `src/operations/agent.ts` with the core agent lifecycle operations: registration, spawning, state management, and lookup helpers. This is the central operations module that orchestrates server, tmux, and SDK interactions to bring an agent to life.

## Prerequisites

This WP depends on:
- **WP01** (Schemas): `AgentStateSchema`, `AgentStatusSchema` must exist in `src/types/schemas.ts`
- **WP02** (Paths/Color): `getAgentStatePath()`, `getAgentLockPath()`, `allocateColor()` must exist
- **WP03** (Server): `ServerManager.ensureRunning()`, `.createSession()`, `.sendPromptReliable()` must exist
- **WP04** (Tmux): `TmuxOperations.splitWindow()`, `.sendKeys()`, `.setPaneOption()`, `.setPaneTitle()`, `.selectLayout()` must exist

## Context

### Codebase Location
- **New file**: `src/operations/agent.ts` (CREATE)
- **Re-export**: `src/operations/index.ts` (EXTEND)
- **Test file**: `tests/agent-operations.test.ts` (CREATE)
- **Contract reference**: `kitty-specs/002-agent-lifecycle-spawning/contracts/spawn-agent.md`

### Existing Operations Pattern
Follow the `TeamOperations` and `TaskOperations` pattern:
```typescript
export const AgentOperations = {
  methodName: (args): ReturnType => {
    // Implementation
  },
};
```

Key conventions:
- Use `withLock()` or `lockedUpdate()` for all state mutations
- Use `writeAtomicJSON()` with Zod schema for all disk writes
- Use `readValidatedJSON()` with Zod schema for all disk reads
- Validate inputs before performing operations
- Return typed results, not thrown exceptions (for tool-facing methods)

### Agent ID Generation
Use `crypto.randomUUID()` for UUID v4 generation (Bun supports Web Crypto API natively).

### Session Title Format (plan.md D3)
`teams::{teamName}::agent::{agentId}::role::{role}`

## Subtasks

### T028: Create module structure

Create `src/operations/agent.ts` with imports and module shell:

```typescript
/**
 * Agent Lifecycle Operations Module
 *
 * Manages agent spawning, monitoring, shutdown, and state.
 * All operations use:
 * - Advisory file locks (via file-lock.ts) for concurrency safety
 * - Atomic writes (via fs-atomic.ts) for crash safety
 * - Zod schemas (via schemas.ts) for runtime validation
 * - Project-specific storage paths (via storage-paths.ts)
 */

import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import {
  type AgentState,
  AgentStateSchema,
  type AgentStatus,
  type TeamConfig,
  TeamConfigSchema,
} from '../types/schemas';
import { withLock } from '../utils/file-lock';
import {
  listJSONFiles,
  lockedUpdate,
  lockedUpsert,
  readValidatedJSON,
  writeAtomicJSON,
} from '../utils/fs-atomic';
import {
  fileExists,
  getAgentLockPath,
  getAgentsDir,
  getAgentStatePath,
  getTeamConfigPath,
  getTeamLockPath,
} from '../utils/storage-paths';
import { allocateColor, releaseColor } from '../utils/color-pool';
import { ServerManager } from './server-manager';
import { TmuxOperations } from './tmux';
import { TeamOperations } from './team';

export const AgentOperations = {
  // Methods defined in subtasks below
};
```

Update `src/operations/index.ts` to re-export:
```typescript
export { AgentOperations } from './agent';
```

### T029: Implement `registerAgent()`

Write agent state to disk and add to TeamConfig.members:

```typescript
registerAgent(agentState: AgentState, projectRoot?: string): AgentState {
  // 1. Validate agentState via AgentStateSchema.parse()
  // 2. Ensure agents directory exists
  // 3. Write agent state file atomically with Zod validation
  //    Path: getAgentStatePath(agentState.id, projectRoot)
  //    Lock: getAgentLockPath(projectRoot)
  // 4. Add agent to TeamConfig.members[] using lockedUpdate on team config
  //    - Create TeamMember from agentState fields
  //    - Use getTeamLockPath() for team lock
  // 5. Return the validated agent state
}
```

### T030: Implement `spawnAgent()` orchestration

The main spawn flow from the spawn-agent contract. This is the core method that ties everything together:

```typescript
async spawnAgent(params: {
  teamName: string;
  prompt: string;
  name?: string;
  model?: string;
  providerId?: string;
  role?: 'worker' | 'reviewer';
  cwd?: string;
  projectRoot?: string;
}): Promise<{
  success: boolean;
  agentId?: string;
  sessionId?: string;
  paneId?: string;
  name?: string;
  color?: string;
  port?: number;
  error?: string;
}> {
  // Step 1: Validate team exists and get config
  //   - Read TeamConfig via getTeamConfigPath()
  //   - Return error if team not found

  // Step 2: Check tmux is available
  //   - TmuxOperations.isInsideTmux() or isTmuxInstalled()
  //   - Return error if not available

  // Step 3: Ensure OpenCode server is running
  //   - ServerManager.ensureRunning(projectPath)
  //   - Return error with diagnostics if failed

  // Step 4: Create SDK session
  //   - Title format: teams::{teamName}::agent::{agentId}::role::{role}
  //   - ServerManager.createSession(port, title, cwd)
  //   - Return error if failed, clean up partial state

  // Step 5: Allocate color
  //   - allocateColor(agentId, projectRoot)

  // Step 6: Create tmux pane
  //   - TmuxOperations.splitWindow(tmuxSession, cwd) → paneId
  //   - TmuxOperations.setPaneTitle(paneId, title)
  //   - TmuxOperations.sendKeys(paneId, attachCommand)
  //     attachCommand: `opencode attach --session ${sessionId} http://${hostname}:${port}`
  //   - TmuxOperations.setPaneOption(paneId, '@opencode_session_id', sessionId)
  //   - TmuxOperations.selectLayout(tmuxSession, 'main-vertical')
  //   - Return error if failed, clean up session

  // Step 7: Register agent state
  //   - Build AgentState object with status: 'spawning'
  //   - registerAgent(agentState)

  // Step 8: Send initial prompt
  //   - ServerManager.sendPromptReliable(port, sessionId, prompt)
  //   - If fails: agent stays in 'spawning' state (leader can retry)

  // Step 9: Update status to 'active'
  //   - updateAgentState(agentId, { status: 'active', heartbeatTs: now })

  // Step 10: Return success result
}
```

**Error cleanup**: If any step fails after partially creating resources:
- If session created but pane fails → log warning (session persists server-side)
- If pane created but registration fails → kill pane, log error
- Always clean up in reverse order

### T031: Implement state helpers

Core helpers for reading and updating agent state:

```typescript
/**
 * Get a single agent's state by ID.
 */
getAgentState(agentId: string, projectRoot?: string): AgentState | null {
  const statePath = getAgentStatePath(agentId, projectRoot);
  if (!fileExists(statePath)) return null;
  try {
    return readValidatedJSON(statePath, AgentStateSchema);
  } catch {
    return null;
  }
}

/**
 * List all agents, optionally filtered by team and/or status.
 */
listAgents(filters?: {
  teamName?: string;
  status?: AgentStatus;
  isActive?: boolean;
}, projectRoot?: string): AgentState[] {
  const agentsDir = getAgentsDir(projectRoot);
  const files = listJSONFiles(agentsDir);
  const agents: AgentState[] = [];

  for (const file of files) {
    try {
      const agent = readValidatedJSON(join(agentsDir, file), AgentStateSchema);
      if (filters?.teamName && agent.teamName !== filters.teamName) continue;
      if (filters?.status && agent.status !== filters.status) continue;
      if (filters?.isActive !== undefined && agent.isActive !== filters.isActive) continue;
      agents.push(agent);
    } catch {
      // Skip corrupted files
    }
  }

  return agents;
}

/**
 * Update agent state fields atomically.
 */
updateAgentState(
  agentId: string,
  updates: Partial<AgentState>,
  projectRoot?: string,
): AgentState {
  const statePath = getAgentStatePath(agentId, projectRoot);
  const lockPath = getAgentLockPath(projectRoot);

  if (!fileExists(statePath)) {
    throw new Error(`Agent '${agentId}' not found`);
  }

  return lockedUpdate(lockPath, statePath, AgentStateSchema, (current) => ({
    ...current,
    ...updates,
    id: current.id,         // ID cannot be changed
    createdAt: current.createdAt, // createdAt cannot be changed
    updatedAt: new Date().toISOString(),
  }));
}
```

### T032: Implement `findAgentBySessionId()`

Lookup an agent by their OpenCode SDK session ID. Used by the heartbeat monitor to route SSE events.

```typescript
/**
 * Find an agent by their SDK session ID.
 * Scans all agent state files.
 */
findAgentBySessionId(sessionId: string, projectRoot?: string): AgentState | null {
  const agents = AgentOperations.listAgents(undefined, projectRoot);
  return agents.find((a) => a.sessionId === sessionId) ?? null;
}
```

### T033: Add unit tests

Create `tests/agent-operations.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Set up isolated temp project root for each test suite
// Set process.env.OPENCODE_PROJECT_ROOT to temp dir

describe('AgentOperations', () => {
  describe('registerAgent', () => {
    // 1. Registers agent and writes state file to disk
    // 2. State file is Zod-valid
    // 3. Agent appears in TeamConfig.members[]
    // 4. Duplicate registration throws
  });

  describe('getAgentState', () => {
    // 1. Returns agent state for valid ID
    // 2. Returns null for non-existent ID
    // 3. Returns null for corrupted state file
  });

  describe('listAgents', () => {
    // 1. Lists all agents
    // 2. Filters by teamName
    // 3. Filters by status
    // 4. Filters by isActive
    // 5. Returns empty array for no agents
  });

  describe('updateAgentState', () => {
    // 1. Updates specified fields
    // 2. Preserves id and createdAt
    // 3. Sets updatedAt timestamp
    // 4. Throws for non-existent agent
  });

  describe('findAgentBySessionId', () => {
    // 1. Finds agent by session ID
    // 2. Returns null for unknown session
  });
});
```

**Test setup**: These tests should NOT require tmux or OpenCode installed. They test the state management layer only. For the `spawnAgent` orchestration flow, create mock/stub implementations of ServerManager and TmuxOperations, or test in WP09 integration tests.

**Important**: Create a team config on disk before testing agent registration (agents reference teams via teamName FK).

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] `src/operations/agent.ts` exports `AgentOperations` object
- [ ] `src/operations/index.ts` re-exports `AgentOperations`
- [ ] `registerAgent()` writes state file + updates TeamConfig atomically
- [ ] `spawnAgent()` follows the 10-step flow from the contract
- [ ] `spawnAgent()` cleans up partial state on failure
- [ ] `updateAgentState()` preserves immutable fields (id, createdAt)
- [ ] All state mutations use advisory locking via `getAgentLockPath()`
- [ ] All disk writes use `writeAtomicJSON` with `AgentStateSchema`
- [ ] `bun test tests/agent-operations.test.ts` passes
- [ ] No `as any` or type suppression

## Activity Log

- 2026-02-10T14:37:04Z – unknown – lane=doing – Code already on main
- 2026-02-10T14:37:06Z – unknown – lane=for_review – Code already on main, verified
