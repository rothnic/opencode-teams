# Tool Contract: heartbeat

**Feature**: 002-agent-lifecycle-spawning
**Tool file**: `src/tools/heartbeat.ts`
**Operations module**: `src/operations/agent.ts`
**Requirements**: FR-004 (Heartbeat and Timeout Detection), FR-007 (Idle Agent Detection)

## Description

Updates the calling agent's heartbeat timestamp to signal liveness. This is the active/explicit heartbeat mechanism - the fallback for cases where SDK SSE events are insufficient (e.g., long computations with no tool calls).

Any registered agent can call this tool. No leader privileges required.

## Zod Input Schema

```typescript
const HeartbeatInputSchema = z.object({
  agentId: z.string().min(1).describe('ID of the agent sending the heartbeat'),
  teamName: z.string().min(1).describe('Team the agent belongs to'),
  status: z.enum(['active', 'idle']).optional().describe('Optional status override. Defaults to current status.'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Optional metadata (current task, progress, etc.)'),
});
```

## Output Schema

```typescript
const HeartbeatOutputSchema = z.object({
  success: z.boolean(),
  heartbeatTs: z.string().datetime(),
  nextDeadline: z.string().datetime(), // When the next heartbeat must arrive to avoid stale detection
  agentStatus: z.string(), // Current agent status after update
  error: z.string().optional(),
});
```

## Execution Flow

```
1. Validate agent exists and is active
   - Read AgentState for agentId
   - FAIL if agent not found
   - FAIL if agent status is 'terminated' or 'inactive'

2. Update heartbeat timestamp
   - Set AgentState.heartbeatTs = new Date().toISOString()
   - Reset AgentState.consecutiveMisses = 0
   - Optionally update AgentState.status if status param provided
   - Write AgentState atomically with Zod validation

3. Calculate next deadline
   - nextDeadline = heartbeatTs + 60s (stale detection threshold)

4. Return result
   - { success: true, heartbeatTs, nextDeadline, agentStatus }
```

## Passive Heartbeat (SDK SSE Events - Background)

In addition to this explicit tool, the system subscribes to SDK SSE events and treats them as implicit heartbeats. This runs as a background process in the plugin's lifecycle hook, NOT as a tool.

```typescript
// In src/index.ts or src/operations/agent.ts (lifecycle hook)
// NOT exposed as a tool - this is internal monitoring

async function startHeartbeatMonitor(serverPort: number) {
  const client = createClient({ baseURL: `http://127.0.0.1:${serverPort}` });
  const stream = client.event.list(); // SSE stream

  for await (const event of stream) {
    const sessionId = event.properties?.sessionID;
    if (!sessionId) continue;

    const agent = findAgentBySessionId(sessionId);
    if (!agent) continue;

    switch (event.type) {
      case 'session.idle':
        updateHeartbeat(agent.id, 'sdk_session_idle');
        if (agent.status === 'active') {
          updateAgentStatus(agent.id, 'idle');
        }
        break;

      case 'session.updated':
      case 'tool.execute.after':
        updateHeartbeat(agent.id, event.type === 'session.updated'
          ? 'sdk_session_updated'
          : 'sdk_tool_execute');
        if (agent.status === 'idle') {
          updateAgentStatus(agent.id, 'active');
        }
        break;

      case 'session.error':
        handleSessionError(agent, event.properties);
        break;
    }
  }
}
```

## Stale Detection (Background Sweep)

```typescript
// Runs every 15s as a background interval
async function sweepStaleAgents() {
  const agents = getAllActiveAgents();
  const now = Date.now();

  for (const agent of agents) {
    const lastHeartbeat = new Date(agent.heartbeatTs).getTime();
    const elapsed = now - lastHeartbeat;

    if (elapsed > 60_000) { // 60s threshold
      agent.consecutiveMisses++;

      if (agent.consecutiveMisses >= 2) {
        // Confirmed stale - mark inactive and reassign tasks
        updateAgentStatus(agent.id, 'inactive');
        reassignAgentTasks(agent.teamName, agent.id);
        notifyLeader(agent.teamName, `Agent ${agent.name} became inactive`);
      }
    }
  }
}
```

## Error Handling

| Error | Response | Recovery |
|-------|----------|----------|
| Agent not found | `{ success: false, error: "Agent '{agentId}' not found" }` | None |
| Agent terminated | `{ success: false, error: "Cannot heartbeat for terminated agent" }` | None |
| Agent inactive | `{ success: false, error: "Agent is inactive. Requires re-spawn." }` | Leader re-spawns agent |
| File write failed | `{ success: false, error: "Failed to update heartbeat: {details}" }` | Retry on next heartbeat |

## Preconditions

- Agent with given ID exists in agent registry
- Agent status is 'spawning', 'active', 'idle', or 'shutting_down'

## Postconditions

- AgentState.heartbeatTs updated to current timestamp
- AgentState.consecutiveMisses reset to 0
- AgentState.status optionally updated

## Timing Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| Recommended call interval | 30s | FR-004, Success Criteria |
| Stale detection threshold | 60s | plan.md Architecture |
| Background sweep interval | 15s | plan.md Heartbeat Flow |
| Grace period | 2 consecutive misses | plan.md (prevents false positives) |
| Effective timeout | 75-90s | 60s threshold + up to 15s sweep + 1 grace miss |
