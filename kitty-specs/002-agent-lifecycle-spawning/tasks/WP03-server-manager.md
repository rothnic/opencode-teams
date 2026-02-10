---
work_package_id: 'WP03'
title: 'Server Manager Operations'
lane: 'planned'
subtasks:
  - 'T014'
  - 'T015'
  - 'T016'
  - 'T017'
  - 'T018'
  - 'T019'
  - 'T020'
phase: 'Phase 1 - Foundation'
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
# Work Package Prompt: WP03 – Server Manager Operations

## Objective

Create `src/operations/server-manager.ts` implementing the OpenCode server lifecycle management: deterministic port calculation, server start/stop, health checking, SDK session creation, and reliable prompt delivery. Export from `src/operations/index.ts`.

## Context

### Codebase Location
- **New file**: `src/operations/server-manager.ts` (CREATE)
- **Re-export**: `src/operations/index.ts` (EXTEND)
- **Test file**: `tests/server-manager.test.ts` (CREATE)
- **Schema dependency (WP01)**: `AgentStateSchema`, `ServerInfoSchema` from `src/types/schemas.ts`
- **Path dependency (WP02)**: `getServerStatePath()`, `getServerLogPath()` from `src/utils/storage-paths.ts`

### Reference Implementation
This module is directly informed by the ntm project's `manager.go`:
- `PortForProject()` → deterministic port from MD5 hash (plan.md, D1)
- `EnsureOpenCodeRunning()` → start server if not running, health check, zombie recovery
- `SendPromptReliable()` → SDK prompt with 3-retry + message count verification (plan.md, D2)

### Architecture Decisions
- **D1 (Server Half-Alive Recovery)**: Retry then escalate. TCP connect → SDK `client.session.list()` → if SDK fails: kill zombie, restart, retry once → if still failing: return error with diagnostics
- **D2 (No Global Mutex)**: Per-session serialization only. No global lock needed since SDK targets specific sessions.

### Existing Patterns to Follow
- Module pattern: `export const ServerManager = { ... }` (matches `TeamOperations`, `TaskOperations`)
- File I/O: Use `writeAtomicJSON()`, `readValidatedJSON()` from `fs-atomic.ts`
- Locking: Use `withLock()` from `file-lock.ts` for server state writes
- Error messages: Return descriptive error objects, not thrown exceptions (tool contract pattern)

### External Dependency
- **`@opencode-ai/sdk`**: Must be added to `package.json` dependencies. The SDK provides:
  - `createClient({ baseURL })` → client instance
  - `client.session.new({ title, directory })` → creates SDK session
  - `client.session.messages(sessionId)` → list messages for verification
  - `client.session.prompt(sessionId, { parts })` → send prompt
  - `client.event.list()` → SSE event stream (used in WP07, not here)

## Subtasks

### T014: Create module with `portForProject()` and SDK client factory

```typescript
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { ServerInfo } from '../types/schemas';
import { ServerInfoSchema } from '../types/schemas';
import { readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import { withLock } from '../utils/file-lock';
import {
  getServerStatePath,
  getServerLogPath,
  getServersDir,
} from '../utils/storage-paths';

export const ServerManager = {
  /**
   * Calculate deterministic port from project path.
   * Port = 28000 + (first 2 bytes of MD5 hash mod 1000).
   */
  portForProject(projectPath: string): number {
    const absPath = resolve(projectPath);
    const hash = createHash('md5').update(absPath).digest();
    const offset = (hash[0] << 8) | hash[1];
    return 28000 + (offset % 1000);
  },

  /**
   * Calculate project hash for directory naming.
   */
  projectHash(projectPath: string): string {
    return createHash('md5').update(resolve(projectPath)).digest('hex');
  },

  /**
   * Create an SDK client for a running server.
   */
  createClient(port: number, hostname = '127.0.0.1') {
    // Dynamic import to avoid hard dependency when SDK not installed
    // Implementation should: return createClient({ baseURL: `http://${hostname}:${port}` })
  },
};
```

**Important**: The `createClient` function should use dynamic `import('@opencode-ai/sdk')` to avoid hard dependency failures during tests where the SDK might not be installed.

### T015: Implement `ensureRunning()`

Start the OpenCode server if not running. Follows the D1 recovery pattern:

```
1. Read existing ServerInfo from disk (if exists)
2. If PID exists: check if process is alive (process.kill(pid, 0))
3. If process alive: TCP connect to port
4. If TCP passes: SDK health check (client.session.list())
5. If SDK passes: return existing ServerInfo
6. If any check fails: kill zombie PID, start fresh
7. Start server: Bun.spawn(["opencode", "serve", "--hostname", "127.0.0.1", "--port", port])
   - Detach from parent process (unref)
   - Redirect stdout/stderr to server.log
8. Poll health endpoint (TCP connect) until ready (5s timeout, 100ms interval)
9. Persist ServerInfo to disk atomically
10. Return ServerInfo
```

**Process spawn details**:
```typescript
const proc = Bun.spawn(['opencode', 'serve', '--hostname', hostname, '--port', String(port)], {
  cwd: projectPath,
  stdout: Bun.file(logPath),
  stderr: Bun.file(logPath),
});
proc.unref(); // Detach from parent
```

**Health check polling**:
```typescript
async function waitForServer(port: number, hostname: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://${hostname}:${port}/`);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(100);
  }
  return false;
}
```

### T016: Implement `stop()`

Stop a running OpenCode server:

```
1. Read ServerInfo from disk
2. If no server info or PID not alive: return (already stopped)
3. Send SIGTERM: process.kill(pid, 'SIGTERM')
4. Wait up to 5 seconds for process to exit
5. If still alive: Send SIGKILL: process.kill(pid, 'SIGKILL')
6. Update ServerInfo on disk: isRunning = false
7. Optionally delete server state files (cleanup mode)
```

**Process death detection**:
```typescript
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // Signal 0 = existence check
    return true;
  } catch {
    return false;
  }
}
```

### T017: Implement `createSession()`

Create an SDK session for a new agent:

```typescript
async createSession(
  port: number,
  title: string,
  directory: string,
  hostname = '127.0.0.1',
): Promise<{ sessionId: string }> {
  const client = ServerManager.createClient(port, hostname);
  const session = await client.session.new({ title, directory });
  return { sessionId: session.id };
}
```

Session title format (from plan.md D3): `teams::{teamName}::agent::{agentId}::role::{role}`

### T018: Implement `sendPromptReliable()`

Reliable prompt delivery with retry and verification (from plan.md D2):

```
1. Get current message count: client.session.messages(sessionId).length
2. Send prompt: client.session.prompt(sessionId, { parts: [{ type: 'text', text: prompt }] })
3. Verify delivery: poll message count until it increases (timeout: 5s)
4. If verification fails: retry up to 3 times with 2s interval
5. If all retries fail: return error (caller can fall back to tmux send-keys)
```

**Prompt sending parameters**:
```typescript
async sendPromptReliable(
  port: number,
  sessionId: string,
  prompt: string,
  options?: { model?: string; providerId?: string; hostname?: string },
): Promise<{ success: boolean; error?: string }> {
  // Implementation with retry logic
}
```

### T019: Implement `status()`

Check if a server is running and healthy:

```typescript
async status(projectPath: string): Promise<ServerInfo | null> {
  const hash = ServerManager.projectHash(projectPath);
  const statePath = getServerStatePath(hash);

  // Try to read existing state
  // Check PID alive
  // Check port responding
  // Return null if no server found or not running
}
```

### T020: Add unit tests

Create `tests/server-manager.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test';

// Tests should verify:
// 1. portForProject returns consistent port for same path
// 2. portForProject returns different ports for different paths
// 3. Port is always in range 28000-28999
// 4. projectHash returns consistent hex hash
// 5. isPidAlive returns false for non-existent PID
// 6. Server state file serialization/deserialization via ServerInfoSchema
// 7. createSession title format matches expected pattern
//
// Note: Full server start/stop tests require OpenCode installed
// and are covered in WP09 integration tests. Unit tests here
// should mock or test individual pure functions.
```

**Focus on pure function tests** that don't require a running OpenCode instance:
- `portForProject()` is deterministic and pure — test extensively
- `projectHash()` is deterministic — test
- State file read/write round-trip via `ServerInfoSchema` — test with temp files

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] `src/operations/server-manager.ts` exports `ServerManager` object
- [ ] `src/operations/index.ts` re-exports `ServerManager`
- [ ] `portForProject()` returns deterministic port in 28000-28999 range
- [ ] `ensureRunning()` handles zombie recovery (D1 pattern)
- [ ] `sendPromptReliable()` retries 3 times with 2s interval
- [ ] All file I/O uses `writeAtomicJSON`/`readValidatedJSON` with `ServerInfoSchema`
- [ ] Server state writes use advisory locking
- [ ] `bun test tests/server-manager.test.ts` passes
- [ ] No `as any` or type suppression
