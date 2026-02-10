---
work_package_id: 'WP07'
title: 'Heartbeat and Monitoring'
lane: 'planned'
subtasks:
  - 'T039'
  - 'T040'
  - 'T041'
  - 'T042'
  - 'T043'
  - 'T044'
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
# Work Package Prompt: WP07 – Heartbeat and Monitoring

## Objective

Add heartbeat update, SSE event monitoring, stale agent detection sweep, and error recovery logic to `AgentOperations` in `src/operations/agent.ts`. Implements FR-004 (Heartbeat), FR-007 (Idle Detection), and the error recovery flow from plan.md.

## Prerequisites

- **WP01** (Schemas): `HeartbeatRecordSchema`, `HeartbeatSourceSchema`, `AgentStatusSchema`
- **WP02** (Paths): `getAgentStatePath()`, `getAgentLockPath()`
- **WP03** (Server): `ServerManager.createClient()`, `.createSession()`, `.sendPromptReliable()`
- **WP05** (Agent): `AgentOperations.getAgentState()`, `.updateAgentState()`, `.listAgents()`, `.findAgentBySessionId()`

## Context

### Codebase Location
- **Extend**: `src/operations/agent.ts` (add heartbeat/monitoring methods)
- **Test file**: `tests/agent-heartbeat.test.ts` (CREATE)
- **Contract reference**: `kitty-specs/002-agent-lifecycle-spawning/contracts/heartbeat.md`

### Heartbeat Architecture (plan.md)
**Hybrid strategy**:
1. **PASSIVE (primary)**: SDK SSE event stream — `session.idle`, `session.updated`, `tool.execute.after` events update heartbeatTs automatically
2. **ACTIVE (fallback)**: Explicit heartbeat tool call — for long computations without tool calls
3. **MONITOR (detection)**: Background sweep every 15s — checks `(now - heartbeatTs) > 60s`

### Timing Parameters
| Parameter | Value |
|-----------|-------|
| Recommended heartbeat interval | 30s |
| Stale detection threshold | 60s |
| Background sweep interval | 15s |
| Grace period | 2 consecutive misses |
| Effective timeout | 75-90s |

### Error Recovery (plan.md)
Three error categories:
1. **Context limit exhaustion**: Create new session, capture pane, re-prompt
2. **Transient API error**: Exponential backoff retry (2s, 4s, 8s)
3. **Process crash**: Mark inactive, reassign tasks, notify leader

## Subtasks

### T039: Implement `updateHeartbeat()`

Update an agent's heartbeat timestamp. Used by both the explicit heartbeat tool and the passive SSE monitor.

```typescript
/**
 * Update an agent's heartbeat timestamp and reset consecutive misses.
 */
updateHeartbeat(
  agentId: string,
  source: HeartbeatSource,
  metadata?: Record<string, unknown>,
  projectRoot?: string,
): {
  success: boolean;
  heartbeatTs: string;
  nextDeadline: string;
  agentStatus: string;
  error?: string;
} {
  const agent = AgentOperations.getAgentState(agentId, projectRoot);
  if (!agent) {
    return { success: false, heartbeatTs: '', nextDeadline: '', agentStatus: '', error: `Agent '${agentId}' not found` };
  }
  if (agent.status === 'terminated' || agent.status === 'inactive') {
    return { success: false, heartbeatTs: '', nextDeadline: '', agentStatus: agent.status, error: `Cannot heartbeat for ${agent.status} agent` };
  }

  const now = new Date();
  const heartbeatTs = now.toISOString();
  const nextDeadline = new Date(now.getTime() + 60_000).toISOString(); // +60s

  // Determine status update based on source
  let statusUpdate: AgentStatus | undefined;
  if (source === 'sdk_session_idle' && agent.status === 'active') {
    statusUpdate = 'idle';
  } else if (
    (source === 'sdk_session_updated' || source === 'sdk_tool_execute') &&
    agent.status === 'idle'
  ) {
    statusUpdate = 'active';
  } else if (source === 'tool' && agent.status === 'spawning') {
    statusUpdate = 'active'; // First heartbeat confirms alive
  }

  const updates: Partial<AgentState> = {
    heartbeatTs,
    consecutiveMisses: 0,
    ...(statusUpdate && { status: statusUpdate, isActive: statusUpdate !== 'inactive' }),
  };

  const updated = AgentOperations.updateAgentState(agentId, updates, projectRoot);

  return {
    success: true,
    heartbeatTs,
    nextDeadline,
    agentStatus: updated.status,
  };
}
```

### T040: Implement `startHeartbeatMonitor()`

Subscribe to SDK SSE events and treat them as implicit heartbeats. This runs as a background async process.

```typescript
/**
 * Start SSE event monitor for passive heartbeat detection.
 * Returns an AbortController to stop monitoring.
 */
async startHeartbeatMonitor(
  serverPort: number,
  hostname = '127.0.0.1',
  projectRoot?: string,
): Promise<AbortController> {
  const controller = new AbortController();

  // Dynamic import to avoid hard dependency
  const { createClient } = await import('@opencode-ai/sdk');
  const client = createClient({ baseURL: `http://${hostname}:${serverPort}` });

  // Run in background (non-blocking)
  (async () => {
    try {
      const stream = client.event.list(); // SSE stream

      for await (const event of stream) {
        if (controller.signal.aborted) break;

        const sessionId = event.properties?.sessionID;
        if (!sessionId) continue;

        const agent = AgentOperations.findAgentBySessionId(sessionId, projectRoot);
        if (!agent) continue;

        switch (event.type) {
          case 'session.idle':
            AgentOperations.updateHeartbeat(agent.id, 'sdk_session_idle', undefined, projectRoot);
            break;

          case 'session.updated':
            AgentOperations.updateHeartbeat(agent.id, 'sdk_session_updated', undefined, projectRoot);
            break;

          case 'tool.execute.after':
            AgentOperations.updateHeartbeat(agent.id, 'sdk_tool_execute', undefined, projectRoot);
            break;

          case 'session.error':
            AgentOperations.handleSessionError(agent, event.properties, projectRoot);
            break;
        }
      }
    } catch (error) {
      // SSE stream disconnected — server may have stopped
      if (!controller.signal.aborted) {
        console.warn('[HeartbeatMonitor] SSE stream disconnected:', error);
      }
    }
  })();

  return controller;
}
```

### T041: Implement `sweepStaleAgents()`

Background sweep that runs periodically to detect stale agents.

```typescript
/**
 * Check all active agents for stale heartbeats.
 * Should be called every 15 seconds via setInterval.
 *
 * Detection logic:
 * - If (now - heartbeatTs) > 60s: increment consecutiveMisses
 * - If consecutiveMisses >= 2: mark inactive, reassign tasks, notify leader
 *
 * @returns Array of agent IDs marked inactive
 */
sweepStaleAgents(projectRoot?: string): string[] {
  const activeAgents = AgentOperations.listAgents(
    { isActive: true },
    projectRoot,
  );

  const now = Date.now();
  const staleIds: string[] = [];

  for (const agent of activeAgents) {
    const lastHeartbeat = new Date(agent.heartbeatTs).getTime();
    const elapsed = now - lastHeartbeat;

    if (elapsed > 60_000) { // 60s threshold
      const newMisses = agent.consecutiveMisses + 1;

      if (newMisses >= 2) {
        // Confirmed stale — mark inactive and reassign tasks
        AgentOperations.updateAgentState(agent.id, {
          status: 'inactive',
          isActive: false,
          consecutiveMisses: newMisses,
          lastError: `Heartbeat timeout: ${Math.round(elapsed / 1000)}s since last heartbeat`,
        }, projectRoot);

        // Reassign tasks (uses TaskOperations.reassignAgentTasks from WP06)
        const { TaskOperations } = require('./task');
        TaskOperations.reassignAgentTasks(agent.teamName, agent.id, projectRoot);

        // Notify team leader
        try {
          const teamConfig = readValidatedJSON(
            getTeamConfigPath(agent.teamName, projectRoot),
            TeamConfigSchema,
          );
          TeamOperations._sendTypedMessage(
            agent.teamName,
            teamConfig.leader,
            `Agent ${agent.name} (${agent.id}) became inactive. Heartbeat timeout after ${Math.round(elapsed / 1000)}s. Tasks reassigned.`,
            'plain',
            'system',
          );
        } catch {
          // Team config read failure — skip notification
        }

        staleIds.push(agent.id);
      } else {
        // First miss — increment counter, give grace period
        AgentOperations.updateAgentState(agent.id, {
          consecutiveMisses: newMisses,
        }, projectRoot);
      }
    }
  }

  return staleIds;
}

/**
 * Start the periodic stale agent sweep.
 * Returns the interval ID for cleanup.
 */
startStaleSweep(intervalMs = 15_000, projectRoot?: string): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      AgentOperations.sweepStaleAgents(projectRoot);
    } catch (error) {
      console.warn('[StaleSweep] Error during sweep:', error);
    }
  }, intervalMs);
}
```

### T042: Implement `handleSessionError()`

Classify SDK session errors and route to appropriate recovery strategy.

```typescript
/**
 * Handle a session error event from the SSE stream.
 * Classifies the error and routes to recovery.
 */
async handleSessionError(
  agent: AgentState,
  eventProperties: Record<string, unknown>,
  projectRoot?: string,
): Promise<void> {
  const errorMessage = String(eventProperties.error || eventProperties.message || 'Unknown error');

  // Classify error type
  if (errorMessage.includes('context') || errorMessage.includes('token limit')) {
    // Context limit exhaustion — rotate session
    await AgentOperations.recoverContextLimit(agent, projectRoot);
  } else if (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('503') ||
    errorMessage.includes('529')
  ) {
    // Transient API error — log and let agent retry
    AgentOperations.updateAgentState(agent.id, {
      lastError: `Transient error: ${errorMessage}`,
    }, projectRoot);
  } else {
    // Unknown error — log for investigation
    AgentOperations.updateAgentState(agent.id, {
      lastError: `Session error: ${errorMessage}`,
    }, projectRoot);
  }
}
```

### T043: Implement context limit recovery

Create new session, capture pane output for context, re-attach and re-prompt.

```typescript
/**
 * Recover from context limit exhaustion by rotating to a new session.
 * 1. Create new SDK session
 * 2. Capture current pane output for context continuity
 * 3. Re-attach pane to new session
 * 4. Send continuation prompt with captured context
 * 5. Update agent state with new sessionId
 */
async recoverContextLimit(
  agent: AgentState,
  projectRoot?: string,
): Promise<void> {
  const { ServerManager } = await import('./server-manager');

  // 1. Create new session
  const title = `teams::${agent.teamName}::agent::${agent.id}::role::${agent.role}`;
  const { sessionId: newSessionId } = await ServerManager.createSession(
    agent.serverPort,
    title,
    agent.cwd,
  );

  // 2. Capture pane output for context
  let capturedContext = '';
  if (agent.paneId) {
    const output = TmuxOperations.capturePaneOutput(agent.paneId, 200);
    if (output) {
      capturedContext = output;
    }

    // 3. Send Ctrl+C to detach from old session, then re-attach
    TmuxOperations.sendKeys(agent.paneId, 'C-c', false);
    await Bun.sleep(500); // Wait for detach

    const attachCmd = `opencode attach --session ${newSessionId} http://127.0.0.1:${agent.serverPort}`;
    TmuxOperations.sendKeys(agent.paneId, attachCmd);

    // Update pane option
    TmuxOperations.setPaneOption(agent.paneId, '@opencode_session_id', newSessionId);
  }

  // 4. Send continuation prompt
  const continuationPrompt = capturedContext
    ? `You are continuing from a previous session that hit the context limit. Here is the last visible output from your terminal:\n\n---\n${capturedContext.slice(-2000)}\n---\n\nPlease continue your work from where you left off.`
    : 'You are continuing from a previous session that hit the context limit. Please check your team inbox and task queue for context, then continue your work.';

  await ServerManager.sendPromptReliable(
    agent.serverPort,
    newSessionId,
    continuationPrompt,
  );

  // 5. Update agent state
  AgentOperations.updateAgentState(agent.id, {
    sessionId: newSessionId,
    sessionRotationCount: agent.sessionRotationCount + 1,
    lastError: `Context limit: rotated to session ${newSessionId}`,
    heartbeatTs: new Date().toISOString(),
    consecutiveMisses: 0,
  }, projectRoot);
}
```

### T044: Add unit tests

Create `tests/agent-heartbeat.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'bun:test';

describe('AgentOperations - Heartbeat', () => {
  describe('updateHeartbeat', () => {
    // 1. Updates heartbeatTs to current time
    // 2. Resets consecutiveMisses to 0
    // 3. Returns nextDeadline = heartbeatTs + 60s
    // 4. Transitions spawning → active on first heartbeat
    // 5. Transitions active → idle on sdk_session_idle source
    // 6. Transitions idle → active on sdk_session_updated source
    // 7. Returns error for terminated agent
    // 8. Returns error for non-existent agent
  });

  describe('sweepStaleAgents', () => {
    // 1. Does nothing for agents with recent heartbeats
    // 2. Increments consecutiveMisses for agents past 60s threshold
    // 3. Does NOT mark inactive on first miss (grace period)
    // 4. Marks inactive on second consecutive miss
    // 5. Reassigns tasks when marking inactive
    // 6. Returns array of stale agent IDs
    // 7. Skips already inactive/terminated agents
  });

  describe('handleSessionError', () => {
    // 1. Sets lastError with context limit message
    // 2. Sets lastError with transient error message
    // 3. Sets lastError for unknown errors
    // (Context limit recovery tested in WP09 integration)
  });
});
```

**Test setup**: Create agents on disk with controlled `heartbeatTs` values to test sweep logic. For sweep tests, set `heartbeatTs` to `new Date(Date.now() - 70_000).toISOString()` (70s ago) to trigger stale detection.

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] `updateHeartbeat()` updates timestamp and resets consecutiveMisses
- [ ] `updateHeartbeat()` handles status transitions correctly (spawning→active, active→idle, idle→active)
- [ ] `sweepStaleAgents()` respects 60s threshold and 2-miss grace period
- [ ] `sweepStaleAgents()` reassigns tasks and notifies leader
- [ ] `handleSessionError()` classifies three error types
- [ ] `recoverContextLimit()` creates new session, captures context, re-prompts
- [ ] `bun test tests/agent-heartbeat.test.ts` passes
- [ ] No `as any` or type suppression
