# OpenCode Teams Architecture

## Overview

OpenCode Teams implements multi-agent coordination inspired by Claude Code's TeammateTool, following OpenCode's plugin architecture and permission-based role system.

## Alignment with Claude Code TeammateTool

Our implementation follows the patterns documented in Claude Code's TeammateTool (see [this analysis](https://gist.github.com/kieranklaassen/d2b35569be2c7f1412c64861a219d51f)):

### File-Based Storage

```
~/.config/opencode/opencode-teams/
├── teams/
│   └── {team-name}/
│       ├── team.json          # Team configuration
│       └── messages/           # Message inbox/outbox
│           └── {message-id}.json
└── tasks/
    └── {team-name}/
        └── {task-id}.json      # Task details
```

### Core Operations

| Operation | Purpose | Permissions |
|-----------|---------|-------------|
| `spawn-team` | Create team, become leader | Leader only |
| `discover-teams` | List available teams | All agents |
| `join-team` | Join existing team | Members only |
| `send-message` | Direct message | All agents |
| `broadcast-message` | Message all members | Leaders, Members |
| `read-messages` | Check inbox | All agents |
| `create-task` | Add to queue | Leaders, Task Managers |
| `get-tasks` | View tasks | All agents |
| `claim-task` | Take ownership | Members, Task Managers |
| `update-task` | Change status | Task owners |

### Environment Variables

Set by OpenCode for agent context:

- `OPENCODE_TEAM_NAME`: Current team
- `OPENCODE_AGENT_ID`: Agent identifier
- `OPENCODE_AGENT_NAME`: Display name
- `OPENCODE_AGENT_TYPE`: Role (leader, member, task-manager)

## Permission-Based Role System

Instead of creating many specific agent types, we define **three core roles** with different tool permissions:

### 1. Team Leader

**Responsibilities**: Strategy, coordination, synthesis

**Allowed Tools**:
- `spawn-team` ✓
- `create-task` ✓
- `broadcast-message` ✓
- `update-task` ✓ (monitor only)
- `send-message` ✓
- `read-messages` ✓

**Denied Tools**:
- `join-team` ✗ (leaders create, not join)
- `claim-task` ✗ (leaders coordinate, not execute)

### 2. Team Member

**Responsibilities**: Task execution, reporting

**Allowed Tools**:
- `join-team` ✓
- `claim-task` ✓
- `update-task` ✓ (own tasks)
- `send-message` ✓
- `broadcast-message` ✓
- `read-messages` ✓

**Denied Tools**:
- `spawn-team` ✗ (members don't create teams)
- `create-task` ✗ (members don't create work)

### 3. Task Manager

**Responsibilities**: Queue management, progress tracking

**Allowed Tools**:
- `create-task` ✓
- `update-task` ✓
- `claim-task` ✓ (if needed)
- `send-message` ✓
- `read-messages` ✓

**Denied Tools**:
- `spawn-team` ✗ (manages tasks, not teams)
- `broadcast-message` ✗ (targeted communication only)

## Specialization Through Skills & Workflows

Rather than hardcoding specialist agents, we combine:

1. **Base Role** (permissions) → What tools you CAN use
2. **Skill** (capability) → What you KNOW how to do
3. **Workflow** (process) → HOW to accomplish a goal

### Example: Security Specialist

```json
{
  "agent": {
    "security-specialist": {
      "extends": "team-member",
      "skill": ["team-coordination", "security-review"],
      "description": "Security-focused team member"
    }
  }
}
```

The agent has:
- **team-member** permissions (can join, claim, update)
- **security-review** skill (knows security patterns)
- Uses **code-review workflow** (follows established process)

## Coordination Patterns

### 1. Leader Pattern

```
Leader → spawn team → create tasks → monitor → synthesize
Workers → discover → join → claim → execute → report
```

Most common. One orchestrator, many specialists.

### 2. Swarm Pattern

```
Leader → spawn team → create 100 tasks
Workers → self-assign from queue
```

For embarrassingly parallel work. Workers are interchangeable.

### 3. Pipeline Pattern

```
Agent A → complete task 1
Agent B (blocked until A done) → complete task 2
Agent C (blocked until B done) → complete task 3
```

Sequential with handoffs.

### 4. Council Pattern

```
Leader → spawn team → broadcast question
Members → each research and propose
Leader → synthesize best answer
```

For decisions needing diverse perspectives.

## Tool Registration

Tools are registered using OpenCode's plugin API:

```typescript
export const OpenCodeTeamsPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      'spawn-team': tool({
        description: 'Create a new team',
        args: {
          teamName: tool.schema.string().describe('Team name'),
          // ...
        },
        async execute(args, ctx) {
          return TeamOperations.spawnTeam(args.teamName, args.leaderInfo);
        },
      }),
      // ... more tools
    },
  };
};
```

OpenCode registers these tools and enforces permissions based on agent configuration.

## Configuration Example

`~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-teams"],
  "permission": {
    "tool": {
      "spawn-team": {
        "team-leader": "allow",
        "*": "ask"
      },
      "claim-task": {
        "team-member": "allow",
        "task-manager": "allow",
        "team-leader": "deny"
      }
    }
  }
}
```

## Workflow Templates

Reusable patterns in `workflows/`:

- **code-review.md**: Parallel specialized review
- **parallel-refactor.md**: Self-organizing task queue
- **feature-factory.md**: Multi-phase with dependencies

Each workflow specifies:
- Required roles
- Tool usage patterns
- Success criteria
- Customization options

## Advantages of This Architecture

### 1. Flexible Specialization

Don't need separate agent types for every specialty. Combine:
- Base role (permissions)
- Skills (capabilities)
- Workflows (processes)

### 2. Security Through Permissions

Leaders can't claim tasks. Members can't spawn teams. Enforced at tool level.

### 3. Reusable Workflows

Same workflow template works for different specializations:
- Code review: security, performance, style
- Testing: unit, integration, e2e
- Documentation: API, guide, README

### 4. Self-Organization

Workers autonomously claim tasks from shared queue. No central micromanagement.

### 5. Observable Coordination

File-based storage makes coordination visible and debuggable.

## Implementation Details

### File-Based Coordination

All state stored in `~/.config/opencode/opencode-teams/`:

**Team Configuration** (`teams/{team-name}/team.json`):
```json
{
  "name": "review-pr-456",
  "leader": "agent-1",
  "members": [
    {"agentId": "agent-2", "agentName": "Security Specialist", "agentType": "security"},
    {"agentId": "agent-3", "agentName": "Perf Specialist", "agentType": "performance"}
  ],
  "createdAt": "2026-01-25T23:00:00Z"
}
```

**Task** (`tasks/{team-name}/{task-id}.json`):
```json
{
  "id": "task-abc123",
  "teamName": "review-pr-456",
  "title": "Security Review",
  "status": "in_progress",
  "owner": "agent-2",
  "createdAt": "2026-01-25T23:00:00Z",
  "claimedAt": "2026-01-25T23:01:00Z"
}
```

**Message** (`teams/{team-name}/messages/{msg-id}.json`):
```json
{
  "id": "msg-xyz789",
  "from": "agent-2",
  "to": "agent-1",
  "message": "Security review complete. Found 2 issues.",
  "timestamp": "2026-01-25T23:05:00Z"
}
```

### Bun API Usage

All file operations use Bun's native APIs:

```typescript
// Read
const file = Bun.file('path/to/file.json');
const data = await file.json();

// Write
await Bun.write('path/to/file.json', JSON.stringify(data));

// Check existence
await Bun.file('path').exists();
```

No Node.js dependencies - pure Bun implementation.

## Future Enhancements

### Heartbeat & Timeout

Add task heartbeat to detect crashed agents:

```typescript
// Worker updates heartbeat
TaskOperations.heartbeat(teamName, taskId);

// System releases tasks with stale heartbeats
// (>5 minutes without update)
```

### Plan Approval

Leader can approve/reject worker plans:

```typescript
// Worker proposes plan
TeamOperations.proposePlan(teamName, plan);

// Leader reviews
TeamOperations.approvePlan(teamName, planId);
// or
TeamOperations.rejectPlan(teamName, planId, feedback);
```

### Shutdown Protocol

Graceful shutdown with confirmation:

```typescript
// Leader requests shutdown
TeamOperations.requestShutdown(teamName, agentId);

// Worker responds
TeamOperations.approveShutdown(); // Done
// or
TeamOperations.rejectShutdown(reason); // Still working
```

### Dependency Tracking

Tasks can block on other tasks:

```typescript
TaskOperations.createTask(teamName, {
  title: "Integration Tests",
  blockedBy: ["task-backend", "task-frontend"]
});
```

## References

- [Claude Code TeammateTool Analysis](https://gist.github.com/kieranklaassen/d2b35569be2c7f1412c64861a219d51f)
- [Claude Flow Multi-Agent Concepts](https://github.com/firstprinciples-labs/agentics/blob/main/claude-flow-guide.md)
- [OpenCode Plugin Documentation](https://opencode.ai/docs/plugins/)
- [OpenCode Permissions](https://opencode.ai/docs/permissions/)
