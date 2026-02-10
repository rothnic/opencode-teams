---
work_package_id: 'WP08'
title: 'Tool Definitions'
lane: 'planned'
subtasks:
  - 'T045'
  - 'T046'
  - 'T047'
  - 'T048'
  - 'T049'
  - 'T050'
phase: 'Phase 3 - Integration Layer'
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
# Work Package Prompt: WP08 – Tool Definitions

## Objective

Create the four new OpenCode tool definitions (`spawn-agent`, `kill-agent`, `heartbeat`, `get-agent-status`) in `src/tools/`, register them in `src/index.ts`, and add SSE monitoring hooks to the plugin lifecycle.

## Prerequisites

- **WP05** (Agent Spawn): `AgentOperations.spawnAgent()` must exist
- **WP06** (Agent Kill): `AgentOperations.forceKill()`, `.requestGracefulShutdown()` must exist
- **WP07** (Heartbeat): `AgentOperations.updateHeartbeat()`, `.startHeartbeatMonitor()`, `.sweepStaleAgents()` must exist

## Context

### Codebase Location
- **New files**: `src/tools/spawn-agent.ts`, `src/tools/kill-agent.ts`, `src/tools/heartbeat.ts`, `src/tools/get-agent-status.ts`
- **Extend**: `src/tools/index.ts` (barrel exports)
- **Extend**: `src/index.ts` (register tools + lifecycle hooks)
- **Contract references**: `kitty-specs/002-agent-lifecycle-spawning/contracts/*.md`

### Existing Tool Pattern
See `src/index.ts` for the established tool registration pattern:

```typescript
'tool-name': tool({
  description: 'Description of what the tool does',
  args: {
    argName: tool.schema.string().describe('Argument description'),
  },
  async execute(args: any, _ctx: any): Promise<ReturnType> {
    return SomeOperations.someMethod(args.argName);
  },
}),
```

**Key points**:
- Tools are thin wrappers — they validate input and delegate to operations
- All args use `tool.schema.xxx()` (NOT `z.xxx()` from zod)
- Return types match the output schemas from contracts
- Error handling is done in the operations layer, not the tool layer

### Existing Tool Files
See `src/tools/spawn-team.ts` and `src/tools/tool-helper.ts` for alternate file-based tool patterns. However, the main registration is in `src/index.ts` inline.

**Decision**: Follow the inline pattern in `src/index.ts` for consistency with existing tools. The `src/tools/*.ts` files can export standalone tool definitions if we want to split later, but registration must be in `src/index.ts`.

## Subtasks

### T045: Create `spawn-agent.ts` tool

Create `src/tools/spawn-agent.ts` with the tool definition:

```typescript
/**
 * spawn-agent tool definition
 * Contract: kitty-specs/002-agent-lifecycle-spawning/contracts/spawn-agent.md
 */

// This file exports the tool configuration for inline registration in src/index.ts
// Input: teamName, prompt, name?, model?, providerId?, role?, cwd?
// Output: { success, agentId, sessionId, paneId, name, color, port, error? }

export function createSpawnAgentTool(tool: any) {
  return tool({
    description: 'Spawn a new AI agent into the team. Only the team leader can spawn agents.',
    args: {
      teamName: tool.schema.string().describe('Name of the team to spawn the agent into'),
      prompt: tool.schema.string().describe('Initial prompt/instructions for the new agent'),
      name: tool.schema.string().optional().describe('Human-readable name (auto-generated if omitted)'),
      model: tool.schema.string().optional().describe('AI model to use (defaults to team default)'),
      providerId: tool.schema.string().optional().describe('Provider ID override'),
      role: tool.schema.string().optional().describe('Agent role: worker or reviewer (default: worker)'),
      cwd: tool.schema.string().optional().describe('Working directory override'),
    },
    async execute(args: any, _ctx: any) {
      const { AgentOperations } = await import('../operations/agent');
      return AgentOperations.spawnAgent({
        teamName: args.teamName,
        prompt: args.prompt,
        name: args.name,
        model: args.model,
        providerId: args.providerId,
        role: args.role === 'reviewer' ? 'reviewer' : 'worker',
        cwd: args.cwd,
      });
    },
  });
}
```

### T046: Create `kill-agent.ts` tool

```typescript
/**
 * kill-agent tool definition
 * Contract: kitty-specs/002-agent-lifecycle-spawning/contracts/kill-agent.md
 */

export function createKillAgentTool(tool: any) {
  return tool({
    description: 'Terminate an agent. Supports graceful shutdown or force-kill. Only the team leader can kill agents.',
    args: {
      teamName: tool.schema.string().describe('Name of the team the agent belongs to'),
      agentId: tool.schema.string().describe('ID of the agent to terminate'),
      force: tool.schema.boolean().optional().describe('Skip graceful shutdown and force-kill immediately (default: false)'),
      reason: tool.schema.string().optional().describe('Reason for termination'),
    },
    async execute(args: any, _ctx: any) {
      const { AgentOperations } = await import('../operations/agent');

      if (args.force) {
        const result = await AgentOperations.forceKill({
          teamName: args.teamName,
          agentId: args.agentId,
          reason: args.reason,
        });
        return {
          ...result,
          method: 'force' as const,
          phase: result.success ? 'force_killed' : 'requested',
        };
      }

      // Graceful shutdown
      const callerAgentId = process.env.OPENCODE_AGENT_ID || 'unknown';
      const result = AgentOperations.requestGracefulShutdown({
        teamName: args.teamName,
        requesterAgentId: callerAgentId,
        targetAgentId: args.agentId,
        reason: args.reason,
      });
      return {
        ...result,
        method: 'graceful' as const,
        reassignedTasks: [],
      };
    },
  });
}
```

### T047: Create `heartbeat.ts` tool

```typescript
/**
 * heartbeat tool definition
 * Contract: kitty-specs/002-agent-lifecycle-spawning/contracts/heartbeat.md
 */

export function createHeartbeatTool(tool: any) {
  return tool({
    description: 'Send a heartbeat to signal agent liveness. Any registered agent can call this.',
    args: {
      agentId: tool.schema.string().describe('ID of the agent sending the heartbeat'),
      teamName: tool.schema.string().describe('Team the agent belongs to'),
      status: tool.schema.string().optional().describe('Optional status override: active or idle'),
      metadata: tool.schema.object({}).optional().describe('Optional metadata (current task, progress, etc.)'),
    },
    async execute(args: any, _ctx: any) {
      const { AgentOperations } = await import('../operations/agent');
      return AgentOperations.updateHeartbeat(
        args.agentId,
        'tool', // Source is always 'tool' when called via this tool
        args.metadata,
      );
    },
  });
}
```

### T048: Create `get-agent-status.ts` tool

```typescript
/**
 * get-agent-status tool definition
 * Contract: kitty-specs/002-agent-lifecycle-spawning/contracts/get-agent-status.md
 */

export function createGetAgentStatusTool(tool: any) {
  return tool({
    description: 'Query the status of one or all agents in a team. Any team member can call this.',
    args: {
      teamName: tool.schema.string().describe('Name of the team to query'),
      agentId: tool.schema.string().optional().describe('Specific agent ID (omit for all agents)'),
      includeServer: tool.schema.boolean().optional().describe('Include OpenCode server status'),
      includeTerminated: tool.schema.boolean().optional().describe('Include terminated agents'),
    },
    async execute(args: any, _ctx: any) {
      const { AgentOperations } = await import('../operations/agent');
      const { ServerManager } = await import('../operations/server-manager');

      // Load agents
      const filters: any = { teamName: args.teamName };
      if (!args.includeTerminated) {
        // Filter will exclude terminated in listAgents
      }
      const agents = AgentOperations.listAgents(filters);

      // If specific agent requested, filter
      let agentList = args.agentId
        ? agents.filter((a: any) => a.id === args.agentId)
        : agents;

      // Filter terminated unless included
      if (!args.includeTerminated) {
        agentList = agentList.filter((a: any) => a.status !== 'terminated');
      }

      // Compute derived fields
      const now = Date.now();
      const enriched = agentList.map((a: any) => {
        const heartbeatAge = Math.round((now - new Date(a.heartbeatTs).getTime()) / 1000);
        return {
          agentId: a.id,
          name: a.name,
          role: a.role,
          model: a.model,
          status: a.status,
          isActive: a.isActive,
          color: a.color,
          heartbeatTs: a.heartbeatTs,
          heartbeatAge,
          heartbeatHealthy: heartbeatAge < 60,
          sessionId: a.sessionId,
          paneId: a.paneId,
          cwd: a.cwd,
          consecutiveMisses: a.consecutiveMisses,
          lastError: a.lastError,
          sessionRotationCount: a.sessionRotationCount,
          createdAt: a.createdAt,
          terminatedAt: a.terminatedAt,
        };
      });

      // Optionally load server status
      let server;
      if (args.includeServer) {
        try {
          const status = await ServerManager.status(process.cwd());
          if (status) {
            server = {
              port: status.port,
              pid: status.pid,
              isRunning: status.isRunning,
              activeSessions: status.activeSessions,
              hostname: status.hostname,
              startedAt: status.startedAt,
            };
          }
        } catch {
          // Server status unavailable
        }
      }

      // Compute summary
      const summary = {
        total: enriched.length,
        active: enriched.filter((a: any) => a.status === 'active').length,
        idle: enriched.filter((a: any) => a.status === 'idle').length,
        inactive: enriched.filter((a: any) => a.status === 'inactive').length,
        shuttingDown: enriched.filter((a: any) => a.status === 'shutting_down').length,
        terminated: args.includeTerminated
          ? agents.filter((a: any) => a.status === 'terminated').length
          : 0,
      };

      return {
        success: true,
        agents: enriched,
        server,
        summary,
      };
    },
  });
}
```

### T049: Register tools in `src/index.ts`

Add all four new tools to the existing tool registration in `src/index.ts`:

```typescript
// In the tool: { ... } section of OpenCodeTeamsPlugin, add:

'spawn-agent': createSpawnAgentTool(tool),
'kill-agent': createKillAgentTool(tool),
'heartbeat': createHeartbeatTool(tool),
'get-agent-status': createGetAgentStatusTool(tool),
```

Also add lifecycle hooks for SSE monitoring:

```typescript
// In the plugin return, add/update session.created hook:
'session.created': async (_event: any) => {
  console.log('[OpenCode Teams] Session created - team coordination tools available');

  // Start heartbeat monitoring if a server is running
  // (Deferred: monitoring is started when first agent is spawned)
},

// Add cleanup hook:
'session.deleted': async (_event: any) => {
  // Existing cleanup logic...
  // Additionally: stop heartbeat monitor if running
},
```

### T050: Update `src/tools/index.ts` barrel exports

Add exports for the new tool creation functions:

```typescript
export { createSpawnAgentTool } from './spawn-agent';
export { createKillAgentTool } from './kill-agent';
export { createHeartbeatTool } from './heartbeat';
export { createGetAgentStatusTool } from './get-agent-status';
```

## Verification Checklist

- [ ] `mise run typecheck` passes
- [ ] `mise run lint` passes
- [ ] `mise run build` succeeds
- [ ] All four tool files exist in `src/tools/`
- [ ] All four tools are registered in `src/index.ts`
- [ ] `src/tools/index.ts` exports all new tool creators
- [ ] Tool descriptions are clear and concise
- [ ] Tools use `tool.schema.xxx()` for args (NOT `z.xxx()`)
- [ ] Tools delegate to operations layer (thin wrappers only)
- [ ] Error handling returns `{ success: false, error: "..." }` (not thrown exceptions)
- [ ] No `as any` or type suppression (except the existing `tool: any` pattern)
- [ ] Existing tools still work: `bun test`
