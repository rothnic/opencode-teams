# OpenCode Teams: Deep MCP Integration Plan

## Executive Summary

This document outlines a comprehensive strategy for deeply integrating the opencode-teams plugin with OpenCode using proper MCP (Model Context Protocol) server architecture. This plan is based on detailed analysis of the [claude-code-teams-mcp](https://github.com/cs50victor/claude-code-teams-mcp) reference implementation, adapted specifically for OpenCode integration.

**Critical Clarification**: This implementation will **ONLY** support OpenCode. We will NOT implement Claude-specific features or directory structures. Instead, we'll leverage OpenCode's native MCP connection capabilities and plugin system for deep integration.

## Architecture Philosophy

### What We're Building

A Bun-based MCP server that:
1. Registers with OpenCode via `~/.config/opencode/opencode.json`
2. Uses OpenCode's storage directories (`~/.config/opencode/opencode-teams/`)
3. Leverages OpenCode's agent spawning and management hooks
4. Provides file-based state coordination with atomic operations
5. Implements long-polling messaging for real-time coordination
6. Integrates with OpenCode's permission system

### What We're NOT Building

- Claude Code-specific features or `~/.claude` directories
- Custom agent spawning with tmux (OpenCode handles agent management)
- Adapter code for multiple frameworks
- Python-based implementation (we'll use Bun/TypeScript)
- Separate CLI tools (OpenCode provides the interface)

## State Management Deep Dive

### Analysis of claude-code-teams-mcp State Implementation

The reference implementation uses a sophisticated state management system:

#### 1. Storage Structure

```
~/.claude/
├── teams/<team-name>/
│   ├── config.json          # Team configuration + member list
│   └── inboxes/
│       ├── team-lead.json   # Lead agent inbox
│       ├── worker-1.json    # Teammate inboxes
│       └── .lock            # File lock for inbox operations
└── tasks/<team-name>/
    ├── 1.json               # Task files (auto-incrementing IDs)
    ├── 2.json
    └── .lock                # File lock for task operations
```

**For OpenCode**, we'll adapt to:
```
~/.config/opencode/opencode-teams/
├── teams/<team-name>/
│   ├── config.json          # Team configuration
│   └── inboxes/
│       ├── <agent-id>.json  # Per-agent inbox
│       └── .lock
└── tasks/<team-name>/
    ├── 1.json
    ├── 2.json
    └── .lock
```

#### 2. Atomic Operations with File Locking

**Reference Implementation** (messaging.py):
```python
import fcntl
from contextmanager import contextmanager

@contextmanager
def file_lock(lock_path: Path):
    lock_path.touch(exist_ok=True)
    with open(lock_path) as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)  # Exclusive lock
        try:
            yield
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)  # Unlock

def read_inbox(team_name, agent_name, mark_as_read=True):
    path = inbox_path(team_name, agent_name)
    if mark_as_read:
        lock_path = path.parent / ".lock"
        with file_lock(lock_path):  # CRITICAL: Lock during read+write
            raw_list = json.loads(path.read_text())
            all_msgs = [InboxMessage.model_validate(entry) for entry in raw_list]
            # Mark messages as read
            for m in all_msgs:
                m.read = True
            # Write back atomically
            path.write_text(json.dumps(serialized))
            return all_msgs
```

**For OpenCode (Bun/TypeScript)**:
```typescript
// src/utils/file-locking.ts
import { flock, FlockMode } from 'bun:ffi';

async function withFileLock<T>(
  lockPath: string,
  callback: () => Promise<T>
): Promise<T> {
  const file = Bun.file(lockPath);
  await Bun.write(lockPath, ''); // Ensure exists
  
  const fd = await file.fd();
  try {
    // Exclusive lock - blocks until available
    await flock(fd, FlockMode.LOCK_EX);
    return await callback();
  } finally {
    await flock(fd, FlockMode.LOCK_UN);
    fd.close();
  }
}

export async function readInbox(
  teamName: string,
  agentId: string,
  markAsRead: boolean = true
): Promise<InboxMessage[]> {
  const inboxPath = getInboxPath(teamName, agentId);
  const lockPath = join(dirname(inboxPath), '.lock');
  
  if (markAsRead) {
    return withFileLock(lockPath, async () => {
      const raw = await Bun.file(inboxPath).json();
      const messages = raw.map(m => InboxMessage.parse(m));
      
      // Mark as read
      messages.forEach(m => m.read = true);
      
      // Atomic write
      await Bun.write(inboxPath, JSON.stringify(messages));
      return messages;
    });
  } else {
    // Read-only, no lock needed
    const raw = await Bun.file(inboxPath).json();
    return raw.map(m => InboxMessage.parse(m));
  }
}
```

#### 3. Message Types and Communication Patterns

**Reference Implementation** defines several message types:

```python
class InboxMessage(BaseModel):
    from_: str = Field(alias="from")
    text: str
    timestamp: str
    read: bool
    summary: Optional[str] = None
    color: Optional[str] = None

class TaskAssignment(BaseModel):
    task_id: str
    subject: str
    description: str
    assigned_by: str
    timestamp: str

class ShutdownRequest(BaseModel):
    request_id: str
    from_: str = Field(alias="from")
    reason: str
    timestamp: str

class ShutdownApproved(BaseModel):
    request_id: str
    from_: str = Field(alias="from")
    timestamp: str
    pane_id: str        # tmux-specific
    backend_type: str   # tmux-specific
```

**For OpenCode**, we adapt:
```typescript
// src/types/messages.ts
interface InboxMessage {
  from: string;
  text: string;
  timestamp: string;
  read: boolean;
  summary?: string;
  color?: string;
  type?: 'plain' | 'task_assignment' | 'shutdown_request' | 'shutdown_approved';
}

interface TaskAssignment {
  type: 'task_assignment';
  taskId: string;
  subject: string;
  description: string;
  assignedBy: string;
  timestamp: string;
}

interface ShutdownRequest {
  type: 'shutdown_request';
  requestId: string;
  from: string;
  reason: string;
  timestamp: string;
}

interface ShutdownApproved {
  type: 'shutdown_approved';
  requestId: string;
  from: string;
  timestamp: string;
  agentId: string;  // OpenCode agent ID (not tmux pane)
}
```

#### 4. Long-Polling Implementation

**Reference Implementation** (server.py):
```python
@mcp.tool
async def poll_inbox(
    team_name: str,
    agent_name: str,
    timeout_ms: int = 30000,
) -> list[dict]:
    """Poll inbox for new unread messages, waiting up to timeout_ms.
    Returns immediately if unread messages exist."""
    
    # Check for immediate messages
    msgs = messaging.read_inbox(team_name, agent_name, unread_only=True, mark_as_read=True)
    if msgs:
        return [m.model_dump(by_alias=True, exclude_none=True) for m in msgs]
    
    # Long-poll: check every 500ms for new messages
    deadline = time.time() + timeout_ms / 1000.0
    while time.time() < deadline:
        await asyncio.sleep(0.5)
        msgs = messaging.read_inbox(team_name, agent_name, unread_only=True, mark_as_read=True)
        if msgs:
            return [m.model_dump(by_alias=True, exclude_none=True) for m in msgs]
    
    return []  # Timeout - no new messages
```

**For OpenCode (Bun)**:
```typescript
// src/tools/poll-inbox.ts
export async function pollInbox(
  teamName: string,
  agentId: string,
  timeoutMs: number = 30000
): Promise<InboxMessage[]> {
  // Immediate check
  let messages = await readInbox(teamName, agentId, true);
  if (messages.filter(m => !m.read).length > 0) {
    return messages;
  }
  
  // Long-poll with 500ms intervals
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await Bun.sleep(500);
    messages = await readInbox(teamName, agentId, true);
    if (messages.filter(m => !m.read).length > 0) {
      return messages;
    }
  }
  
  return [];  // Timeout
}
```

### 5. Task Dependency System

**Reference Implementation** (tasks.py):

The reference uses sophisticated dependency management with cycle detection:

```python
def _would_create_cycle(
    team_dir: Path, from_id: str, to_id: str, pending_edges: dict[str, set[str]]
) -> bool:
    """BFS from to_id through blocked_by chains; cycle if it reaches from_id."""
    visited: set[str] = set()
    queue = deque([to_id])
    while queue:
        current = queue.popleft()
        if current == from_id:
            return True  # Cycle detected
        if current in visited:
            continue
        visited.add(current)
        
        # Check on-disk state
        fpath = team_dir / f"{current}.json"
        if fpath.exists():
            task = TaskFile(**json.loads(fpath.read_text()))
            queue.extend(d for d in task.blocked_by if d not in visited)
        
        # Check pending (in-memory) edges
        queue.extend(d for d in pending_edges.get(current, set()) if d not in visited)
    
    return False

def update_task(team_name, task_id, add_blocks=None, add_blocked_by=None, ...):
    """Three-phase update: Read → Validate → Write"""
    with file_lock(lock_path):
        # Phase 1: Read current state
        task = TaskFile(**json.loads(fpath.read_text()))
        
        # Phase 2: Validate (NO disk writes)
        pending_edges = {}
        if add_blocks:
            for b in add_blocks:
                if _would_create_cycle(team_dir, b, task_id, pending_edges):
                    raise ValueError("Would create circular dependency")
                pending_edges.setdefault(b, set()).add(task_id)
        
        if add_blocked_by:
            for b in add_blocked_by:
                if _would_create_cycle(team_dir, task_id, b, pending_edges):
                    raise ValueError("Would create circular dependency")
                pending_edges.setdefault(task_id, set()).add(b)
        
        # Phase 3: Apply changes atomically
        # Update task and all referenced tasks in memory first
        pending_writes = {}
        
        if add_blocks:
            for b in add_blocks:
                task.blocks.append(b)
                other_task = load_task(b)
                other_task.blocked_by.append(task_id)
                pending_writes[b] = other_task
        
        # Write all changes atomically
        fpath.write_text(json.dumps(task.model_dump()))
        for path, obj in pending_writes.items():
            path.write_text(json.dumps(obj.model_dump()))
```

**For OpenCode**:
```typescript
// src/operations/task-dependencies.ts
function wouldCreateCycle(
  teamDir: string,
  fromId: string,
  toId: string,
  pendingEdges: Map<string, Set<string>>
): boolean {
  const visited = new Set<string>();
  const queue = [toId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === fromId) return true;  // Cycle!
    if (visited.has(current)) continue;
    visited.add(current);
    
    // Check on-disk state
    const taskPath = join(teamDir, `${current}.json`);
    if (await exists(taskPath)) {
      const task = await Bun.file(taskPath).json() as Task;
      task.blockedBy?.forEach(id => {
        if (!visited.has(id)) queue.push(id);
      });
    }
    
    // Check pending edges
    pendingEdges.get(current)?.forEach(id => {
      if (!visited.has(id)) queue.push(id);
    });
  }
  
  return false;
}

export async function updateTask(
  teamName: string,
  taskId: string,
  options: {
    addBlocks?: string[];
    addBlockedBy?: string[];
    // ... other options
  }
): Promise<Task> {
  const teamDir = getTasksDir(teamName);
  const lockPath = join(teamDir, '.lock');
  
  return withFileLock(lockPath, async () => {
    // Phase 1: Read
    const task = await loadTask(teamName, taskId);
    
    // Phase 2: Validate
    const pendingEdges = new Map<string, Set<string>>();
    
    if (options.addBlocks) {
      for (const blockId of options.addBlocks) {
        if (await wouldCreateCycle(teamDir, blockId, taskId, pendingEdges)) {
          throw new Error(`Adding block ${taskId} -> ${blockId} would create cycle`);
        }
        if (!pendingEdges.has(blockId)) {
          pendingEdges.set(blockId, new Set());
        }
        pendingEdges.get(blockId)!.add(taskId);
      }
    }
    
    // Phase 3: Apply atomically
    const pendingWrites = new Map<string, Task>();
    
    if (options.addBlocks) {
      for (const blockId of options.addBlocks) {
        task.blocks = [...(task.blocks || []), blockId];
        const otherTask = await loadTask(teamName, blockId);
        otherTask.blockedBy = [...(otherTask.blockedBy || []), taskId];
        pendingWrites.set(blockId, otherTask);
      }
    }
    
    // Write all changes
    await Bun.write(getTaskPath(teamName, taskId), JSON.stringify(task));
    for (const [id, taskObj] of pendingWrites) {
      await Bun.write(getTaskPath(teamName, id), JSON.stringify(taskObj));
    }
    
    return task;
  });
}
```

## OpenCode Integration Architecture

### MCP Server Registration

**OpenCode's MCP Configuration** (`~/.config/opencode/opencode.json`):
```json
{
  "mcp": {
    "opencode-teams": {
      "type": "local",
      "command": ["bun", "run", "/path/to/opencode-teams/dist/mcp-server.js"],
      "enabled": true,
      "env": {
        "OPENCODE_TEAMS_STORAGE": "~/.config/opencode/opencode-teams"
      }
    }
  }
}
```

### Tool Definitions for MCP

```typescript
// src/mcp-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'opencode-teams',
  version: '1.0.0',
});

// Team Operations
server.tool('team-create', {
  description: 'Create a new agent team with configuration',
  parameters: {
    type: 'object',
    properties: {
      teamName: {
        type: 'string',
        description: 'Unique team identifier (filesystem-safe)',
      },
      description: {
        type: 'string',
        description: 'Team purpose and goals',
      },
    },
    required: ['teamName'],
  },
}, async (params) => {
  const result = await TeamOperations.createTeam(
    params.teamName,
    params.description
  );
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
});

server.tool('team-delete', {
  description: 'Delete team and all associated data',
  parameters: {
    type: 'object',
    properties: {
      teamName: { type: 'string' },
    },
    required: ['teamName'],
  },
}, async (params) => {
  const result = await TeamOperations.deleteTeam(params.teamName);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
});

// Messaging Operations
server.tool('send-message', {
  description: 'Send message to teammate or broadcast',
  parameters: {
    type: 'object',
    properties: {
      teamName: { type: 'string' },
      type: {
        type: 'string',
        enum: ['direct', 'broadcast', 'shutdown_request', 'shutdown_response'],
      },
      recipient: { type: 'string' },
      content: { type: 'string' },
      summary: { type: 'string' },
      sender: { type: 'string', default: 'team-lead' },
    },
    required: ['teamName', 'type'],
  },
}, async (params) => {
  const result = await MessagingOperations.sendMessage(params);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
});

server.tool('poll-inbox', {
  description: 'Long-poll inbox for new messages (up to 30s)',
  parameters: {
    type: 'object',
    properties: {
      teamName: { type: 'string' },
      agentId: { type: 'string' },
      timeoutMs: { type: 'number', default: 30000 },
    },
    required: ['teamName', 'agentId'],
  },
}, async (params) => {
  const messages = await MessagingOperations.pollInbox(
    params.teamName,
    params.agentId,
    params.timeoutMs
  );
  return {
    content: [{ type: 'text', text: JSON.stringify(messages) }],
  };
});

// Task Operations with Dependencies
server.tool('task-update', {
  description: 'Update task with dependency tracking',
  parameters: {
    type: 'object',
    properties: {
      teamName: { type: 'string' },
      taskId: { type: 'string' },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed', 'deleted'],
      },
      owner: { type: 'string' },
      addBlocks: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task IDs that this task blocks',
      },
      addBlockedBy: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task IDs that block this task',
      },
    },
    required: ['teamName', 'taskId'],
  },
}, async (params) => {
  const task = await TaskOperations.updateTask(params);
  return {
    content: [{ type: 'text', text: JSON.stringify(task) }],
  };
});

// Start MCP server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Implementation Phases

### Phase 1: File Locking Foundation (Week 1)

**Goals:**
- Implement fcntl-style file locking using Bun's FFI
- Add atomic write operations for config/inbox/task files
- Create comprehensive tests for concurrent access

**Deliverables:**
- `src/utils/file-locking.ts` with `withFileLock` helper
- `src/utils/atomic-write.ts` for safe file updates
- `tests/file-locking.test.ts` with race condition tests

### Phase 2: Message System Overhaul (Week 2)

**Goals:**
- Implement structured message types (plain, task_assignment, shutdown)
- Add long-polling inbox with 30s timeout
- Refactor to use file locks for all inbox operations

**Deliverables:**
- `src/types/messages.ts` with all message types
- `src/operations/messaging.ts` with polling support
- Updated MCP tools for messaging

### Phase 3: Task Dependencies (Week 3)

**Goals:**
- Add blocks/blockedBy fields to Task type
- Implement cycle detection algorithm
- Add three-phase update (read → validate → write)

**Deliverables:**
- `src/operations/task-dependencies.ts` with cycle detection
- Updated `task-update` tool with dependency support
- Tests for circular dependency prevention

### Phase 4: MCP Server (Week 4)

**Goals:**
- Create standalone MCP server entry point
- Register all 13 tools with proper MCP interfaces
- Test with OpenCode MCP connection

**Deliverables:**
- `src/mcp-server.ts` with MCP SDK integration
- Updated `opencode.json` plugin config
- Documentation for OpenCode MCP setup

### Phase 5: Graceful Shutdown Protocol (Week 5)

**Goals:**
- Implement shutdown request/approval flow
- Add agent cleanup on shutdown
- Reset tasks when agent disconnects

**Deliverables:**
- Shutdown protocol in messaging system
- Agent lifecycle management
- Tests for cleanup scenarios

### Phase 6: Integration & Documentation (Week 6)

**Goals:**
- End-to-end integration tests with OpenCode
- Update all documentation
- Create migration guide

**Deliverables:**
- `tests/integration/` with OpenCode tests
- Updated user guides and examples
- Migration path from current implementation

## OpenCode-Specific Considerations

### Agent Management

**Claude Code** uses tmux for spawning agents. **OpenCode** has its own agent management system.

**Integration Approach:**
- OpenCode spawns agents through its CLI/API
- Our MCP tools provide coordination primitives
- OpenCode's agent system handles lifecycle

**No Custom Spawning Needed**: We won't implement `spawn_teammate` like claude-code-teams-mcp. Instead, users spawn OpenCode agents that connect to our MCP server.

### Permission Integration

OpenCode has a permission system that works with MCP tools:

```json
{
  "permission": {
    "tool": {
      "team-create": {
        "team-leader": "allow",
        "*": "deny"
      },
      "task-update": {
        "team-leader": "allow",
        "task-manager": "allow",
        "*": "deny"
      }
    }
  }
}
```

Our tools will respect OpenCode's permission system automatically.

### Storage Conventions

```
~/.config/opencode/
├── opencode.json           # MCP server configuration
└── opencode-teams/         # Our storage
    ├── teams/<team>/
    │   ├── config.json
    │   └── inboxes/
    └── tasks/<team>/
```

## Benefits Over Current Implementation

1. **Atomic Operations**: File locking prevents race conditions
2. **Real-Time Coordination**: Long-polling reduces message latency
3. **Dependency Tracking**: Tasks can properly express dependencies
4. **Graceful Shutdown**: Proper cleanup when agents stop
5. **MCP Standard**: Works with any MCP client (not just OpenCode)
6. **Observable State**: File-based storage is debuggable
7. **Concurrent Safety**: Multiple agents can coordinate safely

## Migration Path

### For End Users

1. **Install new version** via OpenCode plugin manager
2. **Update opencode.json** with MCP server config
3. **Existing teams migrate automatically** (storage format compatible)
4. **New features** (long-polling, dependencies) available immediately

### For Developers

1. **Phase 1-3**: Core improvements (locking, messaging, dependencies)
2. **Phase 4**: MCP server alongside existing plugin
3. **Phase 5-6**: Deprecate old plugin, promote MCP server

## Testing Strategy

### Unit Tests
- File locking under concurrent access
- Cycle detection algorithm
- Message serialization/deserialization
- Atomic write operations

### Integration Tests
- Multi-agent coordination scenarios
- Long-polling message delivery
- Task dependency enforcement
- Graceful shutdown cleanup

### Performance Tests
- Concurrent inbox access (10+ agents)
- Long-poll timeout accuracy
- File lock contention under load

## Success Criteria

- [ ] All file operations use atomic writes with locking
- [ ] Long-polling works with <1s latency for new messages
- [ ] Task dependencies prevent circular references
- [ ] Graceful shutdown leaves no orphaned state
- [ ] Compatible with OpenCode's MCP connection system
- [ ] 100% test coverage for critical paths
- [ ] Documentation complete for all new features

## References

- [claude-code-teams-mcp](https://github.com/cs50victor/claude-code-teams-mcp) - Reference implementation
- [Claude Code Deep Dive](https://gist.github.com/cs50victor/0a7081e6824c135b4bdc28b566e1c719) - Internal protocol analysis
- [MCP Specification](https://modelcontextprotocol.io/) - Protocol documentation
- [OpenCode MCP](https://opencode.ai/docs/mcp/) - OpenCode's MCP integration

## Appendix: Complete Tool List

### MCP Tools (13 total)

1. **team-create** - Create new team
2. **team-delete** - Delete team and data
3. **team-read-config** - Get team configuration
4. **send-message** - Send direct/broadcast messages
5. **read-inbox** - Read agent's inbox
6. **poll-inbox** - Long-poll for new messages
7. **task-create** - Create new task
8. **task-get** - Get task details
9. **task-list** - List all team tasks
10. **task-update** - Update task with dependencies
11. **shutdown-request** - Request agent shutdown
12. **shutdown-process** - Process approved shutdown
13. **agent-remove** - Remove agent from team

All tools support OpenCode's permission system and work through MCP protocol.
