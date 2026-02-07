# MCP Migration Plan: OpenCode Teams → Claude Code Teams MCP

## Executive Summary

This document outlines the migration from our current OpenCode plugin architecture to a proper MCP (Model Context Protocol) server that implements Claude Code's agent teams protocol, making our team coordination capabilities available to any MCP client.

## Current State vs Target State

### Current Implementation (OpenCode Plugin)

**Architecture:**
- OpenCode plugin using `tool()` helper from plugin SDK
- Tools registered in plugin hooks
- Global operations exposed via TeamOperations/TaskOperations
- File-based storage in `~/.config/opencode/opencode-teams/`
- Permission-based roles (team-leader, team-member, task-manager)
- 11 custom tools for team/task operations

**Limitations:**
1. **Not truly MCP-based**: Uses OpenCode-specific plugin system
2. **No agent spawning**: Agents must be manually started
3. **No tmux integration**: Can't visualize or manage agents via terminal
4. **Simple messaging**: Basic file-based messaging without long-polling
5. **No shutdown protocol**: Agents just stop, no graceful coordination
6. **OpenCode-specific**: Only works with OpenCode, not Claude Code or other MCP clients

### Target Implementation (MCP Server)

**Architecture (based on claude-code-teams-mcp):**
- Standalone MCP server usable by any MCP client
- Tmux-based agent spawning (one pane per agent)
- File-locking for concurrent access safety
- Long-poll inbox system (up to 30s waits)
- Graceful shutdown with approval protocol
- Task dependency tracking (blocks/blockedBy)
- Storage in `~/.claude/` (or configurable)

**Benefits:**
1. **Universal compatibility**: Works with Claude Code, OpenCode, any MCP client
2. **Better agent management**: Tmux panes for each agent with color coding
3. **Robust concurrency**: fcntl file locks + atomic writes
4. **Real-time coordination**: Long-polling reduces latency
5. **Graceful lifecycle**: Proper startup/shutdown protocols
6. **Better observability**: Visual agent management via tmux

## Gap Analysis

### 1. Architecture Gaps

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| **Protocol** | OpenCode plugin | MCP server | Need to implement MCP server interface |
| **Client Support** | OpenCode only | Any MCP client | Need protocol abstraction layer |
| **Tool Registration** | OpenCode tool() helper | MCP tools API | Need MCP-compliant tool definitions |

### 2. Agent Spawning Gaps

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| **Spawn Method** | Manual agent start | Tmux split-window | Need tmux integration |
| **Agent Visibility** | No visualization | Tmux panes with colors | Need tmux pane management |
| **Process Management** | None | PID tracking | Need process lifecycle tracking |
| **Agent Identification** | name@team format | name@team + tmux pane | Need pane ID mapping |

### 3. Messaging Gaps

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| **Inbox Implementation** | JSON files | JSON + file locks | Need fcntl locking |
| **Read Method** | Immediate read | Long-poll (up to 30s) | Need polling mechanism |
| **Concurrency Safety** | None | File locks + atomic writes | Need locking primitives |
| **Message Types** | Basic | DM, broadcast, approval | Need approval protocol |

### 4. Task Management Gaps

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| **Dependencies** | None | blocks/blockedBy arrays | Need dependency tracking |
| **Status Updates** | Basic status | Status + metadata | Need richer status model |
| **Atomic Updates** | None | tempfile + os.replace | Need atomic file operations |

### 5. Lifecycle Management Gaps

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| **Shutdown** | Abrupt stop | Graceful + approval | Need shutdown protocol |
| **Cleanup** | Manual | Automated teammate removal | Need cleanup on exit |
| **Force Kill** | None | Force kill + cleanup | Need emergency termination |

### 6. Storage Gaps

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| **Location** | ~/.config/opencode/ | ~/.claude/ (configurable) | Need path configuration |
| **Structure** | teams/tasks split | Unified under team | Need restructuring |
| **Locking** | None | .lock files per directory | Need lock file management |

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

**Goal**: Create MCP server foundation while maintaining OpenCode plugin compatibility

**Tasks:**
1. Set up Python MCP server project structure
2. Implement MCP server interface (following claude-code-teams-mcp pattern)
3. Create Bun-to-Python bridge for existing operations
4. Add configuration for storage paths
5. Implement file locking primitives (fcntl for Python)

**Deliverables:**
- Working MCP server that can be installed via `uvx`
- Basic tool registration (create, list, delete operations)
- File-locking utilities
- Configuration system

### Phase 2: Tmux Integration (Week 3)

**Goal**: Add tmux-based agent spawning and management

**Tasks:**
1. Implement tmux wrapper functions
2. Create agent spawn logic with color assignment
3. Add process tracking (PID mapping)
4. Implement force-kill functionality
5. Add pane discovery and listing

**Deliverables:**
- `spawn_teammate` tool working with tmux
- Agent panes visible with colors
- Process management utilities
- `force_kill_teammate` tool

### Phase 3: Messaging System (Week 4)

**Goal**: Upgrade messaging to use long-polling and approvals

**Tasks:**
1. Implement long-poll mechanism (up to 30s timeout)
2. Add message type handling (DM, broadcast, approval)
3. Implement shutdown approval protocol
4. Add plan approval responses
5. Improve inbox file locking

**Deliverables:**
- `poll_inbox` tool with long-polling
- Approval message handling
- `process_shutdown_approved` tool
- Robust concurrent inbox access

### Phase 4: Task Enhancements (Week 5)

**Goal**: Add task dependencies and atomic updates

**Tasks:**
1. Implement `blocks`/`blockedBy` arrays
2. Add dependency validation
3. Implement atomic task updates (tempfile pattern)
4. Add task metadata support
5. Improve task querying with filters

**Deliverables:**
- Task dependency tracking
- Atomic file operations
- Enhanced `task_update` tool
- Dependency resolution logic

### Phase 5: Migration & Testing (Week 6)

**Goal**: Migrate existing workflows and validate against both Claude Code and OpenCode

**Tasks:**
1. Update workflow templates for MCP patterns
2. Migrate skills to work with MCP tools
3. Create compatibility layer for OpenCode
4. Test with Claude Code CLI
5. Test with OpenCode
6. Performance benchmarking

**Deliverables:**
- Updated workflow templates
- MCP-compatible skills
- Compatibility documentation
- Test results from both clients
- Performance metrics

### Phase 6: Documentation & Polish (Week 7)

**Goal**: Comprehensive documentation and examples

**Tasks:**
1. Write MCP server installation guide
2. Update USER-GUIDE with MCP examples
3. Create tmux workflow documentation
4. Add debugging guide
5. Create video demonstrations

**Deliverables:**
- Complete MCP installation docs
- Updated user guide
- Tmux integration guide
- Troubleshooting documentation
- Example videos

## Technical Implementation Details

### MCP Server Structure

```python
# server.py - Main MCP server
from mcp import Server, Tool
import asyncio
from pathlib import Path

class TeamsMCPServer:
    def __init__(self, storage_root: Path = Path.home() / ".claude"):
        self.storage_root = storage_root
        self.teams_dir = storage_root / "teams"
        self.tasks_dir = storage_root / "tasks"
        
    async def handle_tool_call(self, tool_name: str, args: dict):
        # Dispatch to appropriate handler
        handlers = {
            "team_create": self.team_create,
            "spawn_teammate": self.spawn_teammate,
            # ... other handlers
        }
        return await handlers[tool_name](args)
```

### File Locking Pattern

```python
import fcntl
from contextlib import contextmanager

@contextmanager
def lock_file(path: Path):
    lock_path = path.parent / ".lock"
    lock_path.touch(exist_ok=True)
    with open(lock_path, 'r') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
```

### Tmux Integration Pattern

```python
import subprocess

def spawn_in_tmux(agent_id: str, team: str, color: str):
    """Spawn Claude Code instance in new tmux pane"""
    pane_title = f"[{agent_id}]"
    cmd = [
        "tmux", "split-window",
        "-h",  # horizontal split
        "-t", f":{team}",  # target session
        "-P",  # print pane ID
        f"claude-code --agent-id {agent_id} --team {team}"
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    pane_id = result.stdout.strip()
    
    # Set pane color
    subprocess.run([
        "tmux", "select-pane",
        "-t", pane_id,
        "-P", f"bg={color}"
    ])
    
    return pane_id
```

### Long-Poll Inbox Pattern

```python
import asyncio
import time

async def poll_inbox(agent_id: str, team: str, timeout: int = 30):
    """Long-poll inbox for new messages"""
    inbox_path = get_inbox_path(agent_id, team)
    start_time = time.time()
    last_count = count_messages(inbox_path)
    
    while time.time() - start_time < timeout:
        with lock_file(inbox_path):
            current_count = count_messages(inbox_path)
            if current_count > last_count:
                # New messages arrived
                return read_inbox(inbox_path)
        
        await asyncio.sleep(0.5)  # Poll every 500ms
    
    return []  # Timeout, no new messages
```

## Compatibility Considerations

### Dual Support Strategy

To maintain compatibility with existing OpenCode workflows while adding MCP support:

1. **Keep OpenCode Plugin**: Maintain current plugin as facade over MCP server
2. **Shared Storage**: Both access same ~/.claude/ storage
3. **Tool Mapping**: OpenCode tools call MCP server tools
4. **Gradual Migration**: Users can adopt MCP at their own pace

### Configuration Example

```json
// OpenCode: opencode.json
{
  "plugins": ["opencode-teams"],  // Legacy plugin
  "mcp": {
    "teams": {  // New MCP server
      "type": "local",
      "command": ["uvx", "--from", "git+https://github.com/rothnic/opencode-teams", "opencode-teams"],
      "enabled": true
    }
  }
}

// Claude Code: .mcp.json
{
  "mcpServers": {
    "opencode-teams": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/rothnic/opencode-teams", "opencode-teams"]
    }
  }
}
```

## Success Metrics

### Functional Metrics
- [ ] MCP server installable via uvx
- [ ] Works with Claude Code CLI
- [ ] Works with OpenCode
- [ ] Tmux panes spawn correctly
- [ ] File locking prevents corruption
- [ ] Long-polling reduces message latency
- [ ] Graceful shutdown completes successfully
- [ ] Task dependencies resolve correctly

### Performance Metrics
- Message latency: < 1s (vs current ~5s polling)
- Agent spawn time: < 2s
- Task update time: < 100ms
- Concurrent access: 10+ agents without corruption
- Memory usage: < 50MB per agent

### User Experience Metrics
- Installation: One command (`uvx` install)
- Visual clarity: Color-coded tmux panes
- Discoverability: `team_list` shows all agents
- Debugging: Clear error messages with tmux pane IDs

## Risks & Mitigation

### Risk 1: Breaking Changes
**Impact**: High  
**Mitigation**: Maintain OpenCode plugin compatibility layer; provide migration guide

### Risk 2: Tmux Dependency
**Impact**: Medium  
**Mitigation**: Document tmux installation; provide fallback for non-tmux environments

### Risk 3: Python Ecosystem Friction
**Impact**: Medium  
**Mitigation**: Use uvx for zero-install experience; provide pre-built binaries

### Risk 4: Storage Migration
**Impact**: Low  
**Mitigation**: Auto-migrate ~/.config/opencode/ → ~/.claude/ on first run

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1: Foundation | 2 weeks | Week 1 | Week 2 |
| Phase 2: Tmux Integration | 1 week | Week 3 | Week 3 |
| Phase 3: Messaging | 1 week | Week 4 | Week 4 |
| Phase 4: Task Enhancements | 1 week | Week 5 | Week 5 |
| Phase 5: Migration & Testing | 1 week | Week 6 | Week 6 |
| Phase 6: Documentation | 1 week | Week 7 | Week 7 |
| **Total** | **7 weeks** | | |

## Next Steps

1. **Immediate**: Create Python project structure for MCP server
2. **Week 1**: Implement basic MCP server with tool registration
3. **Week 2**: Add file locking and storage management
4. **Week 3**: Implement tmux integration
5. **Weekly Reviews**: Demo progress and gather feedback

## References

- [Claude Code Teams MCP Implementation](https://github.com/cs50victor/claude-code-teams-mcp)
- [Claude Code Agent Teams Gist](https://gist.github.com/cs50victor/0a7081e6824c135b4bdc28b566e1c719)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [OpenCode Plugin Documentation](https://opencode.ai/docs/plugins/)
- [Tmux Manual](https://github.com/tmux/tmux/wiki)

## Appendix: Tool Mapping

### Current (OpenCode Plugin) → Target (MCP Server)

| OpenCode Tool | MCP Tool | Changes |
|---------------|----------|---------|
| spawn-team | team_create | Add tmux session creation |
| join-team | spawn_teammate | Add tmux pane spawning |
| send-message | send_message | Add approval types |
| read-messages | read_inbox / poll_inbox | Add long-polling |
| create-task | task_create | Add atomic writes |
| update-task | task_update | Add dependencies |
| get-tasks | task_list | Add filtering |
| - | team_delete | New: cleanup on delete |
| - | force_kill_teammate | New: emergency termination |
| - | process_shutdown_approved | New: graceful exit |
| - | read_config | New: team inspection |
| - | task_get | New: single task details |
