# Tool Contract: spawn-agent

**Feature**: 002-agent-lifecycle-spawning
**Tool file**: `src/tools/spawn-agent.ts`
**Operations module**: `src/operations/agent.ts`
**Requirements**: FR-001 (Agent Spawning), FR-005 (Metadata), FR-006 (Session Management), FR-009 (OpenCode only)

## Description

Spawns a new AI agent into the caller's team. Starts the OpenCode server if needed, creates an SDK session, opens a tmux pane with the TUI, and sends the initial prompt.

Only the team leader can spawn agents.

## Zod Input Schema

```typescript
const SpawnAgentInputSchema = z.object({
  teamName: z.string().min(1).describe('Name of the team to spawn the agent into'),
  prompt: z.string().min(1).describe('Initial prompt/instructions for the new agent'),
  name: z.string().min(1).optional().describe('Human-readable name for the agent (auto-generated if omitted)'),
  model: z.string().optional().describe('AI model to use (e.g., "claude-sonnet-4-20250514"). Defaults to team default.'),
  providerId: z.string().optional().describe('Provider ID override (e.g., "anthropic")'),
  role: z.enum(['worker', 'reviewer']).default('worker').describe('Agent role within the team'),
  cwd: z.string().optional().describe('Working directory override. Defaults to project root.'),
});
```

## Output Schema

```typescript
const SpawnAgentOutputSchema = z.object({
  success: z.boolean(),
  agentId: z.string(),
  sessionId: z.string(),
  paneId: z.string(),
  name: z.string(),
  color: z.string(),
  port: z.number(),
  error: z.string().optional(),
});
```

## Execution Flow

```
1. Validate caller is team leader
   - Read TeamConfig for teamName
   - Check caller's agentId matches TeamConfig.leader
   - FAIL if not leader

2. Ensure OpenCode server is running
   - ServerManager.ensureRunning(projectPath)
   - Returns ServerInfo { pid, port, hostname }
   - If server not running: start via Bun.spawn("opencode", ["serve", ...])
   - Poll health endpoint until ready (5s timeout, 100ms interval)

3. Create SDK session
   - client = createClient({ baseURL: `http://${hostname}:${port}` })
   - session = await client.session.new({ title: agentName, directory: cwd })
   - Extract sessionId

4. Allocate color from pool
   - Read ColorPool from disk
   - Assign next available color from COLOR_PALETTE
   - Write updated ColorPool atomically

5. Create tmux pane
   - TmuxOperations.splitWindow(tmuxSessionName, cwd) -> paneId
   - TmuxOperations.setPaneTitle(paneId, `${tmuxSessionName}__${role}_${index}`)
   - TmuxOperations.sendKeys(paneId, `opencode attach --session ${sessionId} http://${hostname}:${port}`)
   - TmuxOperations.setPaneOption(paneId, '@opencode_session_id', sessionId)
   - TmuxOperations.selectLayout(tmuxSessionName, layout)

6. Register agent state
   - Generate UUID v4 for agentId
   - Build AgentState object (status: 'spawning')
   - Write to getAgentStatePath(agentId) atomically with Zod validation
   - Add agent to TeamConfig.members[]

7. Send initial prompt
   - ServerManager.sendPromptReliable(sessionId, prompt)
   - Retry up to 3 times with 2s interval
   - Verify delivery by checking message count increase
   - Fallback to tmux send-keys if SDK delivery fails

8. Update agent status
   - Set status to 'active' after prompt delivery confirmed
   - Set heartbeatTs to current timestamp

9. Return result
```

## Error Handling

| Error | Response | Recovery |
|-------|----------|----------|
| Caller is not team leader | `{ success: false, error: "Only the team leader can spawn agents" }` | None |
| Team not found | `{ success: false, error: "Team '{teamName}' does not exist" }` | None |
| Tmux not available | `{ success: false, error: "tmux is required for agent spawning" }` | None |
| Server failed to start | `{ success: false, error: "Failed to start OpenCode server: {details}" }` | Check logs at getServerLogPath() |
| Session creation failed | `{ success: false, error: "Failed to create SDK session: {details}" }` | Server may need restart |
| Pane creation failed | `{ success: false, error: "Failed to create tmux pane: {details}" }` | Clean up session |
| Prompt delivery failed (all retries) | Agent spawned but marked 'spawning', needs manual prompt | Leader can re-send via messaging |
| Color pool exhausted | Fallback: assign least-recently-used color from inactive agents | Warn in response |

## Preconditions

- Caller is the leader of the specified team
- Tmux is installed and a session is active
- OpenCode CLI is installed (for `opencode serve` / `opencode attach`)
- Network port for project is available (28000-28999 range)

## Postconditions

- AgentState file exists at `getAgentStatePath(agentId)`
- Agent is listed in TeamConfig.members[]
- Tmux pane is open and showing OpenCode TUI
- SDK session is created and prompt has been delivered
- ColorPool updated with new assignment
- ServerInfo updated with incremented activeSessions

## Performance

- Target: Agent fully operational within 30 seconds (FR success criteria)
- Server startup: 0-5s (if already running: 0s)
- Session creation: <1s
- Tmux pane: <1s
- Prompt delivery: 1-5s (with retries)
