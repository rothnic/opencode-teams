# OpenCode Teams: Native Plugin + Optional Tmux Session Manager

## Executive Summary

This document outlines the refined architecture for opencode-teams as a **native OpenCode plugin** with an **optional Bun-based tmux session manager**. This approach:
- Uses OpenCode's native plugin system (custom tools via `tool()` helper)
- Adds robust state management from claude-code-teams-mcp (file locking, long-polling)
- Provides optional project-based tmux session spawning (inspired by oh-my-opencode)
- Stays Bun-native for all tooling and process management

**Key Decisions**:
- ✅ Native OpenCode plugin with custom tools (NOT separate MCP server)
- ✅ Bun/TypeScript for all implementation
- ✅ Optional CLI tool for project-specific OpenCode server + tmux management
- ✅ File locking, long-polling, task dependencies from reference implementation
- ❌ No Python, no separate MCP servers, no Claude-specific features

## Architecture Overview

### Component 1: Enhanced OpenCode Plugin (Current + Improvements)

**What it is**: The existing opencode-teams plugin with enhanced state management

**Features**:
- 11+ custom tools registered via OpenCode's `tool()` helper
- File-based coordination in `~/.config/opencode/opencode-teams/`
- **NEW**: fcntl-based file locking for concurrency safety
- **NEW**: Long-polling inbox system (30s timeout)
- **NEW**: Task dependencies with cycle detection
- **NEW**: Graceful shutdown protocol

**Installation**: Standard OpenCode plugin installation
```bash
opencode plugin install opencode-teams
```

### Component 2: Tmux Session Manager (New, Optional)

**What it is**: Bun-based CLI tool for project-specific OpenCode server management

**Features**:
- Detects if OpenCode server is running for current project
- Spawns OpenCode server in tmux session if needed
- Creates tmux panes for multi-agent visualization
- Manages session lifecycle (cleanup on disconnect)
- Similar to oh-my-opencode but project-scoped

**Installation**: Optional global CLI tool
```bash
bun install -g opencode-teams
```

**Usage**:
```bash
# In your project directory
opencode-teams init
# This will:
# 1. Check if OpenCode server is running for this project
# 2. If not, spawn OpenCode in a new tmux session
# 3. Set up tmux layout for agent visibility
# 4. Dispose session when all clients disconnect
```

## State Management Implementation

### Storage Structure (Global vs Project-Specific)

**Global Configuration** (`~/.config/opencode/opencode-teams/`):
```
~/.config/opencode/opencode-teams/
├── config.json              # User preferences, default settings
├── templates/               # Reusable team/workflow templates
│   ├── code-review-team.json
│   └── deployment-team.json
└── cache/                   # Cached data, temporary state
    └── session-registry.json
```

**Project-Specific State** (`<project>/.opencode/opencode-teams/`):
```
<project-root>/.opencode/opencode-teams/
├── teams/<team-name>/
│   ├── config.json          # Team configuration + members
│   └── inboxes/
│       ├── <agent-id>.json  # Per-agent message inbox
│       └── .lock            # File lock for atomic inbox operations
└── tasks/<team-name>/
    ├── 1.json               # Task files (auto-incrementing IDs)
    ├── 2.json
    ├── ...
    └── .lock                # File lock for atomic task operations
```

**Rationale**:
- **Teams are project-specific** - Each project has its own teams working on that codebase
- **Messages are project-specific** - Communication tied to project context
- **Tasks are project-specific** - Work items belong to the project
- **Templates are global** - Reusable patterns shared across projects
- **Config is global** - User preferences apply everywhere

### Path Resolution Utilities

**Core utility for determining storage locations**:

```typescript
// src/utils/storage-paths.ts
import { join } from 'path';
import { homedir } from 'os';

// Global configuration directory
export function getGlobalConfigDir(): string {
  return join(homedir(), '.config', 'opencode', 'opencode-teams');
}

// Project-specific storage directory
export function getProjectStorageDir(projectRoot?: string): string {
  const root = projectRoot || process.cwd();
  return join(root, '.opencode', 'opencode-teams');
}

// Specific subdirectories
export function getProjectTeamsDir(projectRoot?: string): string {
  return join(getProjectStorageDir(projectRoot), 'teams');
}

export function getProjectTasksDir(projectRoot?: string): string {
  return join(getProjectStorageDir(projectRoot), 'tasks');
}

export function getGlobalTemplatesDir(): string {
  return join(getGlobalConfigDir(), 'templates');
}

export function getGlobalUserConfig(): string {
  return join(getGlobalConfigDir(), 'config.json');
}

// Example usage:
// const teamsDir = getProjectTeamsDir(); // <cwd>/.opencode/opencode-teams/teams
// const templatesDir = getGlobalTemplatesDir(); // ~/.config/opencode/opencode-teams/templates
```

### File Locking with Bun FFI

**Concept** (from claude-code-teams-mcp):
- Use `fcntl` for exclusive file locks
- Ensures atomic read-modify-write operations
- Prevents race conditions with concurrent agents

**Implementation** (Bun/TypeScript):

```typescript
// src/utils/file-lock.ts
import { dlopen, FFIType, suffix } from 'bun:ffi';

// Load libc for fcntl
const libc = dlopen(`libc.${suffix}`, {
  open: {
    args: [FFIType.cstring, FFIType.i32],
    returns: FFIType.i32,
  },
  fcntl: {
    args: [FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  close: {
    args: [FFIType.i32],
    returns: FFIType.i32,
  },
});

const F_SETLK = 6; // Linux
const F_RDLCK = 0;
const F_WRLCK = 1;
const F_UNLCK = 2;

export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>
): Promise<T> {
  // Ensure lock file exists
  await Bun.write(lockPath, '');
  
  // Open file for locking
  const fd = libc.symbols.open(Buffer.from(lockPath + '\0'), 2); // O_RDWR
  if (fd < 0) {
    throw new Error(`Failed to open lock file: ${lockPath}`);
  }

  try {
    // Acquire exclusive lock (blocks until available)
    const lockResult = libc.symbols.fcntl(fd, F_SETLK, F_WRLCK);
    if (lockResult < 0) {
      throw new Error(`Failed to acquire lock: ${lockPath}`);
    }

    // Execute critical section
    return await fn();
  } finally {
    // Release lock and close
    libc.symbols.fcntl(fd, F_SETLK, F_UNLCK);
    libc.symbols.close(fd);
  }
}
```

**Usage in Operations**:

```typescript
// src/operations/messaging.ts
import { join } from 'path';

// Helper to get project-specific storage path
function getProjectTeamsDir(): string {
  // Get current working directory (project root)
  const projectRoot = process.cwd();
  return join(projectRoot, '.opencode', 'opencode-teams', 'teams');
}

export async function readInbox(
  teamName: string,
  agentId: string,
  markAsRead: boolean = true
): Promise<Message[]> {
  const teamsDir = getProjectTeamsDir();
  const inboxPath = join(
    teamsDir,
    teamName,
    'inboxes',
    `${agentId}.json`
  );
  const lockPath = join(teamsDir, teamName, 'inboxes', '.lock');

  return await withFileLock(lockPath, async () => {
    // Read current inbox
    const file = Bun.file(inboxPath);
    const messages: Message[] = await file.exists()
      ? await file.json()
      : [];

    if (markAsRead) {
      // Mark all as read
      const updated = messages.map((m) => ({ ...m, read: true }));
      await Bun.write(inboxPath, JSON.stringify(updated, null, 2));
    }

    return messages;
  });
}
```

### Long-Polling Inbox System

**Concept**: Agent polls inbox with 30s timeout, checking every 500ms

**Implementation**:

```typescript
// src/tools/poll-inbox.ts
export const pollInbox = tool({
  description: 'Long-poll inbox for new messages (up to 30s)',
  args: {
    teamName: z.string(),
    agentId: z.string(),
    timeout: z.number().default(30000), // 30 seconds
  },
  async execute({ teamName, agentId, timeout }, context) {
    const startTime = Date.now();
    const checkInterval = 500; // 500ms

    while (Date.now() - startTime < timeout) {
      // Check for unread messages
      const messages = await readInbox(teamName, agentId, false);
      const unread = messages.filter((m) => !m.read);

      if (unread.length > 0) {
        // Found new messages! Mark as read and return
        await readInbox(teamName, agentId, true);
        return {
          success: true,
          messages: unread,
          polledMs: Date.now() - startTime,
        };
      }

      // Wait before next check
      await Bun.sleep(checkInterval);
    }

    // Timeout - no new messages
    return {
      success: true,
      messages: [],
      polledMs: timeout,
      timedOut: true,
    };
  },
});
```

### Task Dependencies with Cycle Detection

**Concept**: Tasks can block other tasks; detect circular dependencies

**Implementation**:

```typescript
// src/operations/task-dependencies.ts
export interface Task {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
  blocks: number[]; // Task IDs this task blocks
  blockedBy: number[]; // Task IDs blocking this task
  // ... other fields
}

export function detectCycles(tasks: Task[]): boolean {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<number>();
  const recStack = new Set<number>();

  function hasCycle(taskId: number): boolean {
    if (recStack.has(taskId)) return true; // Cycle detected!
    if (visited.has(taskId)) return false; // Already checked

    visited.add(taskId);
    recStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      for (const blockedId of task.blocks) {
        if (hasCycle(blockedId)) return true;
      }
    }

    recStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (hasCycle(task.id)) return true;
  }

  return false;
}

export async function updateTaskWithDependencies(
  teamName: string,
  taskId: number,
  updates: Partial<Task>,
  projectRoot?: string
): Promise<{ success: boolean; error?: string }> {
  const tasksDir = join(getProjectTasksDir(projectRoot), teamName);
  const lockPath = join(tasksDir, '.lock');

  return await withFileLock(lockPath, async () => {
    // Read all tasks
    const tasks = await loadAllTasks(teamName, projectRoot);
    const taskIndex = tasks.findIndex((t) => t.id === taskId);

    if (taskIndex === -1) {
      return { success: false, error: 'Task not found' };
    }

    // Apply updates
    const updatedTask = { ...tasks[taskIndex], ...updates };
    tasks[taskIndex] = updatedTask;

    // Check for cycles
    if (detectCycles(tasks)) {
      return { success: false, error: 'Dependency cycle detected' };
    }

    // Write updated task atomically
    const taskPath = join(tasksDir, `${taskId}.json`);
    const tmpPath = `${taskPath}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(updatedTask, null, 2));
    await Bun.spawn(['mv', tmpPath, taskPath]).exited;

    return { success: true };
  });
}
```

## Tmux Session Manager Implementation

### Session Detection and Spawning

**Goal**: Start OpenCode server in tmux if not already running for this project

**Implementation** (Bun-native, no shell scripts):

```typescript
// cli/session-manager.ts
import { spawn } from 'bun';
import { join } from 'path';

interface SessionInfo {
  name: string;
  panes: number;
  windows: number;
}

async function getTmuxSessions(): Promise<SessionInfo[]> {
  const proc = spawn(['tmux', 'list-sessions', '-F', '#{session_name}']);
  const text = await new Response(proc.stdout).text();
  
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((name) => ({ name, panes: 0, windows: 0 }));
}

async function isOpenCodeRunning(projectDir: string): Promise<boolean> {
  // Check if OpenCode server is running for this project
  // Could check for port, process, or session file
  const sessionFile = join(projectDir, '.opencode-session');
  return await Bun.file(sessionFile).exists();
}

export async function ensureOpenCodeSession(
  projectDir: string
): Promise<string> {
  const sessionName = `opencode-${basename(projectDir)}`;

  // Check if session already exists
  const sessions = await getTmuxSessions();
  if (sessions.some((s) => s.name === sessionName)) {
    console.log(`✓ Tmux session '${sessionName}' already exists`);
    return sessionName;
  }

  // Check if OpenCode is running outside tmux
  if (await isOpenCodeRunning(projectDir)) {
    console.log(`✓ OpenCode already running for ${projectDir}`);
    return sessionName;
  }

  // Create new tmux session with OpenCode
  console.log(`Creating tmux session '${sessionName}'...`);
  
  await spawn([
    'tmux',
    'new-session',
    '-d', // Detached
    '-s',
    sessionName,
    '-c',
    projectDir, // Working directory
    'opencode',
    '--port',
    '4096',
  ]).exited;

  // Store session info
  await Bun.write(
    join(projectDir, '.opencode-session'),
    JSON.stringify({
      sessionName,
      pid: process.pid,
      started: new Date().toISOString(),
    })
  );

  console.log(`✓ OpenCode started in tmux session '${sessionName}'`);
  return sessionName;
}
```

### Tmux Layout Management

**Goal**: Create panes for agent visibility (similar to oh-my-opencode)

```typescript
// cli/tmux-layout.ts
export async function createAgentPane(
  sessionName: string,
  agentName: string,
  command: string
): Promise<void> {
  // Split current pane
  await spawn([
    'tmux',
    'split-window',
    '-t',
    sessionName,
    '-h', // Horizontal split
    '-p',
    '30', // 30% width
  ]).exited;

  // Rename pane
  await spawn([
    'tmux',
    'select-pane',
    '-t',
    sessionName,
    '-T',
    agentName,
  ]).exited;

  // Send command to pane
  await spawn([
    'tmux',
    'send-keys',
    '-t',
    sessionName,
    command,
    'C-m', // Enter
  ]).exited;

  // Reapply layout
  await spawn([
    'tmux',
    'select-layout',
    '-t',
    sessionName,
    'main-vertical',
  ]).exited;
}
```

### Session Cleanup

**Goal**: Dispose session when all clients disconnect

```typescript
// cli/session-cleanup.ts
export async function cleanupSession(
  projectDir: string
): Promise<void> {
  const sessionFile = join(projectDir, '.opencode-session');
  const file = Bun.file(sessionFile);

  if (!(await file.exists())) {
    return; // No session to clean up
  }

  const sessionInfo = await file.json();
  const sessionName = sessionInfo.sessionName;

  // Check if any clients are still connected
  // (This would involve checking OpenCode's internal state or process count)
  const hasClients = await checkForConnectedClients(sessionName);

  if (!hasClients) {
    console.log(`No clients connected, cleaning up session '${sessionName}'...`);
    
    // Kill tmux session
    await spawn(['tmux', 'kill-session', '-t', sessionName]).exited;

    // Remove session file
    await Bun.spawn(['rm', sessionFile]).exited;

    console.log(`✓ Session '${sessionName}' cleaned up`);
  }
}

async function checkForConnectedClients(sessionName: string): Promise<boolean> {
  // Check tmux clients
  const proc = spawn(['tmux', 'list-clients', '-t', sessionName]);
  const text = await new Response(proc.stdout).text();
  return text.trim().length > 0;
}
```

## CLI Tool Usage

### Installation

```bash
# Install globally with Bun
bun install -g opencode-teams

# Or use directly with bunx
bunx opencode-teams init
```

### Commands

```bash
# Initialize OpenCode session for current project
opencode-teams init

# Check status
opencode-teams status

# Attach to existing session
opencode-teams attach

# Stop session (if no clients)
opencode-teams stop

# Force stop
opencode-teams stop --force
```

### Configuration

User can configure tmux layout in `~/.config/opencode-teams/config.json`:

```json
{
  "tmux": {
    "enabled": true,
    "layout": "main-vertical",
    "mainPaneSize": 60,
    "autoCleanup": true
  }
}
```

## Enhanced Plugin Tools

The plugin now provides these custom tools (registered via OpenCode's `tool()` helper):

### Team Operations
1. **spawn-team** - Create new team with configuration
2. **discover-teams** - List all available teams
3. **join-team** - Add agent to team
4. **get-team-info** - Get team configuration and members

### Communication (with file locking)
5. **send-message** - Send direct/broadcast message
6. **broadcast-message** - Send to all team members
7. **read-messages** - Read inbox (marks as read)
8. **poll-inbox** - Long-poll for new messages (NEW)

### Task Management (with dependencies)
9. **create-task** - Create task with optional dependencies (NEW)
10. **get-tasks** - List tasks with filters
11. **claim-task** - Claim task for execution
12. **update-task** - Update task status/dependencies (NEW)

### Lifecycle (NEW)
13. **request-shutdown** - Request graceful team shutdown
14. **approve-shutdown** - Approve shutdown request

All tools automatically integrate with OpenCode's permission system.

## Implementation Phases

### Phase 1: Enhanced State Management (2 weeks)
- [ ] Implement file locking with Bun FFI
- [ ] Add atomic write operations
- [ ] Update all operations to use locks
- [ ] Add comprehensive concurrency tests

### Phase 2: Long-Polling & Dependencies (2 weeks)
- [ ] Implement poll-inbox tool
- [ ] Add task dependency fields
- [ ] Implement cycle detection
- [ ] Add dependency enforcement tests

### Phase 3: CLI Tool Foundation (1 week)
- [ ] Create Bun-based CLI project structure
- [ ] Implement session detection
- [ ] Implement OpenCode spawning in tmux
- [ ] Add basic cleanup logic

### Phase 4: Tmux Layout Management (1 week)
- [ ] Implement pane creation/management
- [ ] Add layout configuration
- [ ] Implement auto-cleanup on disconnect
- [ ] Test with multiple agents

### Phase 5: Integration & Testing (1 week)
- [ ] End-to-end workflow testing
- [ ] Performance testing with concurrent agents
- [ ] Documentation and examples
- [ ] User acceptance testing

### Phase 6: Polish & Release (1 week)
- [ ] Error handling and edge cases
- [ ] User documentation
- [ ] Video tutorials
- [ ] Release v2.0.0

**Total Timeline**: 8 weeks

## Success Criteria

- [ ] All file operations use atomic writes with locking
- [ ] Long-polling delivers messages with <1s latency
- [ ] Task dependencies prevent circular references
- [ ] CLI tool spawns OpenCode in tmux reliably
- [ ] Session cleanup works when clients disconnect
- [ ] 100% test coverage for critical paths
- [ ] Complete documentation for all features
- [ ] Positive user feedback on usability

## Benefits of This Approach

1. **Native Integration**: Uses OpenCode's plugin system, not external servers
2. **Concurrent Safety**: File locking prevents race conditions
3. **Real-Time Coordination**: Long-polling reduces message latency
4. **Visual Feedback**: Optional tmux sessions for agent visibility
5. **Bun-Native**: All tooling uses Bun for consistency and performance
6. **Project-Scoped**: Each project gets its own OpenCode session
7. **Auto-Cleanup**: Sessions dispose when no longer needed

## References

- [claude-code-teams-mcp](https://github.com/cs50victor/claude-code-teams-mcp) - State management patterns
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) - Tmux integration approach
- [OpenCode Plugins](https://opencode.ai/docs/plugins/) - Plugin architecture
- [Bun FFI](https://bun.sh/docs/api/ffi) - Foreign function interface for file locking
