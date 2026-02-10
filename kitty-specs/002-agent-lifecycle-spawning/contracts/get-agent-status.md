# Tool Contract: get-agent-status

**Feature**: 002-agent-lifecycle-spawning
**Tool file**: `src/tools/get-agent-status.ts`
**Operations module**: `src/operations/agent.ts`
**Requirements**: FR-004 (Heartbeat), FR-005 (Metadata), FR-007 (Idle Detection)

## Description

Queries the status of one or all agents in a team. Returns comprehensive metadata including lifecycle state, heartbeat health, session info, and server status. Any team member can call this tool.

## Zod Input Schema

```typescript
const GetAgentStatusInputSchema = z.object({
  teamName: z.string().min(1).describe('Name of the team to query'),
  agentId: z.string().optional().describe('Specific agent ID to query. If omitted, returns all agents in team.'),
  includeServer: z.boolean().default(false).describe('Include OpenCode server status in response'),
  includeTerminated: z.boolean().default(false).describe('Include terminated agents in results'),
});
```

## Output Schema

```typescript
const AgentStatusResponseSchema = z.object({
  agentId: z.string(),
  name: z.string(),
  role: z.enum(['leader', 'worker', 'reviewer']),
  model: z.string(),
  status: AgentStatusSchema,  // spawning | active | idle | inactive | shutting_down | terminated
  isActive: z.boolean(),
  color: z.string(),

  // Heartbeat health
  heartbeatTs: z.string().datetime(),
  heartbeatAge: z.number(), // seconds since last heartbeat
  heartbeatHealthy: z.boolean(), // true if age < 60s

  // Session info
  sessionId: z.string(),
  paneId: z.string().optional(),
  cwd: z.string(),

  // Error tracking
  consecutiveMisses: z.number(),
  lastError: z.string().optional(),
  sessionRotationCount: z.number(),

  // Timestamps
  createdAt: z.string().datetime(),
  terminatedAt: z.string().datetime().optional(),
});

const GetAgentStatusOutputSchema = z.object({
  success: z.boolean(),
  agents: z.array(AgentStatusResponseSchema),
  server: z.object({
    port: z.number(),
    pid: z.number(),
    isRunning: z.boolean(),
    activeSessions: z.number(),
    hostname: z.string(),
    startedAt: z.string().datetime(),
  }).optional(),
  summary: z.object({
    total: z.number(),
    active: z.number(),
    idle: z.number(),
    inactive: z.number(),
    shuttingDown: z.number(),
    terminated: z.number(),
  }),
  error: z.string().optional(),
});
```

## Execution Flow

```
1. Validate team exists
   - Read TeamConfig for teamName
   - FAIL if team not found

2. Load agent states
   - If agentId provided:
     - Read single AgentState file
     - FAIL if not found
   - If agentId omitted:
     - Read all AgentState files for team
     - Filter out terminated unless includeTerminated=true

3. Compute derived fields for each agent
   - heartbeatAge = (Date.now() - Date.parse(heartbeatTs)) / 1000
   - heartbeatHealthy = heartbeatAge < 60

4. Optionally load server status
   - If includeServer=true:
     - Read ServerInfo for project
     - Verify server PID is alive (process.kill(pid, 0))
     - Verify port is responding (TCP connect check)

5. Compute summary
   - Count agents by status

6. Return result
```

## Error Handling

| Error | Response | Recovery |
|-------|----------|----------|
| Team not found | `{ success: false, error: "Team '{teamName}' does not exist" }` | None |
| Agent not found (specific query) | `{ success: false, error: "Agent '{agentId}' not found in team '{teamName}'" }` | None |
| Agent state file corrupted | Skip agent, include warning in response | Re-spawn agent |
| Server state file missing | Return `server: undefined` even if requested | Server may need restart |

## Preconditions

- Caller is a member of the specified team (any role)
- Team exists in project storage

## Postconditions

- No state mutations (read-only operation)
- No side effects

## Usage Patterns

### Leader checking team health
```
get-agent-status({ teamName: "review-pr-123", includeServer: true })
```

### Worker checking own status
```
get-agent-status({ teamName: "review-pr-123", agentId: "my-agent-id" })
```

### Monitoring all agents including terminated
```
get-agent-status({ teamName: "review-pr-123", includeTerminated: true })
```

## Summary Field Semantics

| Field | Counts agents with status... |
|-------|------------------------------|
| `total` | All agents (excluding terminated unless includeTerminated) |
| `active` | status === 'active' |
| `idle` | status === 'idle' |
| `inactive` | status === 'inactive' |
| `shuttingDown` | status === 'shutting_down' |
| `terminated` | status === 'terminated' (only if includeTerminated=true) |
