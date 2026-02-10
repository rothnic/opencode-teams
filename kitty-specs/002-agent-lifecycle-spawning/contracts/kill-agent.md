# Tool Contract: kill-agent

**Feature**: 002-agent-lifecycle-spawning
**Tool file**: `src/tools/kill-agent.ts`
**Operations module**: `src/operations/agent.ts`
**Requirements**: FR-002 (Force Kill), FR-003 (Shutdown Protocol), FR-008 (Task Reassignment)

## Description

Terminates an agent, either gracefully (three-phase shutdown negotiation) or forcefully (immediate termination). Handles tmux pane cleanup, task reassignment, and state file updates.

Only the team leader can kill agents.

## Zod Input Schema

```typescript
const KillAgentInputSchema = z.object({
  teamName: z.string().min(1).describe('Name of the team the agent belongs to'),
  agentId: z.string().min(1).describe('ID of the agent to terminate'),
  force: z.boolean().default(false).describe('Skip graceful shutdown and force-kill immediately'),
  reason: z.string().optional().describe('Reason for termination (sent to agent in shutdown request)'),
});
```

## Output Schema

```typescript
const KillAgentOutputSchema = z.object({
  success: z.boolean(),
  method: z.enum(['graceful', 'force']),
  phase: z.enum(['requested', 'approved', 'rejected', 'confirmed', 'force_killed']),
  reassignedTasks: z.array(z.string()), // task IDs that were reassigned
  error: z.string().optional(),
});
```

## Execution Flow

### Graceful Shutdown (force: false)

```
1. Validate caller is team leader
   - Same validation as spawn-agent

2. Validate target agent exists and is active
   - Read AgentState for agentId
   - FAIL if agent not found or already terminated

3. Send shutdown request (Phase 1)
   - Create ShutdownRequest { phase: 'requested', ... }
   - Deliver as MessageType 'shutdown_request' to target agent's inbox
   - Update AgentState.status to 'shutting_down'
   - Return { success: true, method: 'graceful', phase: 'requested', reassignedTasks: [] }

4. Agent response handling (Phase 2 - async)
   - Target agent reads shutdown_request from inbox
   - Target agent responds with MessageType 'shutdown_approved' (approved: true/false)
   - If approved:
     - Agent completes current work
     - Agent confirms shutdown readiness
   - If rejected:
     - Leader receives rejection with reason
     - Leader can re-request or force-kill

5. Cleanup on approval (Phase 3 - triggered by agent response)
   - Reassign all tasks owned by agent (FR-008)
   - Kill tmux pane: TmuxOperations.killPane(paneId)
   - Release color back to pool
   - Update AgentState: status='terminated', terminatedAt=now
   - Remove agent from TeamConfig.members[]
   - Decrement ServerInfo.activeSessions
   - Reap server if activeSessions reaches 0
```

### Force Kill (force: true)

```
1. Validate caller is team leader (same as above)

2. Validate target agent exists
   - Agent can be in ANY status except 'terminated'

3. Immediate termination
   - Kill tmux pane: TmuxOperations.killPane(paneId)
   - Reassign all tasks owned by agent (FR-008)
   - Release color back to pool
   - Create ShutdownRequest { phase: 'force_killed', force: true }
   - Update AgentState: status='terminated', terminatedAt=now
   - Remove agent from TeamConfig.members[]
   - Decrement ServerInfo.activeSessions
   - Return { success: true, method: 'force', phase: 'force_killed', reassignedTasks: [...] }
```

## Error Handling

| Error | Response | Recovery |
|-------|----------|----------|
| Caller is not team leader | `{ success: false, error: "Only the team leader can kill agents" }` | None |
| Agent not found | `{ success: false, error: "Agent '{agentId}' not found" }` | None |
| Agent already terminated | `{ success: false, error: "Agent '{agentId}' is already terminated" }` | None |
| Agent already shutting down | `{ success: false, error: "Agent already in shutdown. Use force=true to override." }` | Force kill |
| Tmux pane cleanup failed | Log warning, continue with state cleanup | Pane may need manual cleanup |
| Task reassignment failed | Log error, continue with termination | Tasks may be orphaned |
| Shutdown rejected by agent | `{ success: true, method: 'graceful', phase: 'rejected' }` | Leader decides: force-kill or accept |

## Task Reassignment Detail (FR-008)

```typescript
// Reuses existing TaskOperations pattern
function reassignAgentTasks(teamName: string, agentId: string): string[] {
  const tasks = TaskOperations.getTasks(teamName, { owner: agentId });
  const reassigned: string[] = [];
  for (const task of tasks) {
    if (task.status === 'in_progress') {
      TaskOperations.updateTask(teamName, task.id, {
        status: 'pending',
        owner: undefined,
        claimedAt: undefined,
        warning: `Reassigned: previous owner ${agentId} terminated`,
      });
      reassigned.push(task.id);
    }
  }
  return reassigned;
}
```

## Preconditions

- Caller is the leader of the specified team
- Target agent exists in team's agent registry

## Postconditions

- **Graceful**: ShutdownRequest delivered to agent inbox; agent status is 'shutting_down'
- **Force**: Agent terminated immediately; tmux pane killed; tasks reassigned; state updated
- In both final states: AgentState.status === 'terminated', agent removed from TeamConfig.members[]

## Edge Cases

- **Killing agent that owns no tasks**: No reassignment needed; just clean up process and state
- **Killing agent during shutdown**: If `force=false` and already 'shutting_down', return error suggesting `force=true`
- **Killing leader agent**: Not allowed via this tool. The leader cannot kill itself. Team dissolution is a separate operation.
- **Network-dead agent (pane gone)**: Force kill still works; pane cleanup is best-effort
- **Concurrent kill requests**: Advisory lock prevents race conditions on state file updates
