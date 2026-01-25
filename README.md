# OpenCode Teams Plugin

Multi-agent team coordination plugin for [OpenCode](https://opencode.ai), inspired by Claude Code's TeammateTool feature.

Enable teams of AI agents to collaborate on complex coding tasks through coordinated workflows, task distribution, and inter-agent communication.

Built with TypeScript following the [bun-module](https://github.com/zenobi-us/bun-module) structure for modern tooling and publishing.

## Features

- **Team Management**: Create and coordinate teams of AI agents
- **Task Distribution**: Shared task queue for work distribution
- **Inter-Agent Communication**: Direct messaging and broadcasts
- **Multiple Agent Types**: Leaders, workers, and specialists
- **File-Based Coordination**: Persistent team state and messages
- **Example Workflows**: Pre-built team templates for common scenarios
- **TypeScript**: Full type safety and modern development experience

## Quick Start

### Installation

For published package:

```bash
bun add opencode-teams
```

Or reference directly in your `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

For development/local installation:

```bash
# Clone to OpenCode's global plugins directory
git clone https://github.com/rothnic/opencode-teams.git ~/.config/opencode/plugins/opencode-teams
cd ~/.config/opencode/plugins/opencode-teams
bun install
mise run build
```

Then reference in `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

The plugin will automatically:
- Register itself with OpenCode
- Create data storage in `~/.config/opencode/opencode-teams/`
- Make `TeamOperations` and `TaskOperations` available globally
- Register included skills and agent templates

### Basic Usage

#### Create a Team

```javascript
// Leader creates a team
const team = global.TeamOperations.spawnTeam('code-review-pr-123', {
  agentId: 'leader-1',
  agentName: 'Review Coordinator',
  agentType: 'leader'
});
```

#### Create Tasks

```javascript
// Add tasks to the queue
global.TaskOperations.createTask('code-review-pr-123', {
  title: 'Security Review',
  description: 'Check for vulnerabilities',
  priority: 'high'
});
```

#### Workers Claim Tasks

```javascript
// Worker joins team
global.TeamOperations.requestJoin('code-review-pr-123', {
  agentId: 'worker-1',
  agentName: 'Security Specialist'
});

// Claim and complete task
const tasks = global.TaskOperations.getTasks('code-review-pr-123', { status: 'pending' });
global.TaskOperations.claimTask('code-review-pr-123', tasks[0].id);

// ... do the work ...

global.TaskOperations.updateTask('code-review-pr-123', tasks[0].id, {
  status: 'completed'
});
```

#### Communication

```javascript
// Send direct message
global.TeamOperations.write('code-review-pr-123', 'leader-1', 'Task complete!');

// Broadcast to all
global.TeamOperations.broadcast('code-review-pr-123', 'All reviews done!');
```

## Architecture

### Plugin Structure

```
opencode-teams/
├── src/
│   ├── index.ts           # Main plugin with TeamOperations and TaskOperations
│   └── version.ts         # Version info
├── dist/                  # Built output (generated)
│   ├── index.js
│   ├── index.d.ts
│   └── version.js
├── skills/
│   ├── spawn-team/        # Team creation and management
│   ├── team-communicate/  # Inter-agent messaging
│   └── team-coordinate/   # Task management
├── agent/
│   ├── team-leader/       # Leader agent template
│   ├── team-worker/       # Worker agent template
│   └── code-reviewer/     # Specialist reviewer template
├── examples/
│   ├── code-review-team.md
│   └── ...
├── package.json           # Module metadata with build scripts
├── tsconfig.json          # TypeScript configuration
├── RESEARCH.md            # Background on TeammateTool
└── README.md
```

### Core Operations

#### TeamOperations

- `spawnTeam(teamName, leaderInfo)` - Create new team
- `discoverTeams()` - List available teams
- `requestJoin(teamName, agentInfo)` - Join a team
- `getTeamInfo(teamName)` - Get team details
- `write(teamName, targetAgentId, message)` - Direct message
- `broadcast(teamName, message)` - Message all members
- `readMessages(teamName, agentId)` - Read your messages
- `cleanup(teamName)` - Remove team data

#### TaskOperations

- `createTask(teamName, taskData)` - Create new task
- `getTasks(teamName, filters)` - List tasks
- `updateTask(teamName, taskId, updates)` - Update task
- `claimTask(teamName, taskId)` - Claim a task

### Data Storage

All plugin data is stored in `~/.config/opencode/opencode-teams/`:

```
~/.config/opencode/opencode-teams/
├── teams/
│   └── {team-name}/
│       ├── config.json          # Team metadata, member list
│       └── messages/            # Inter-agent mailbox
└── tasks/
    └── {team-name}/             # Team-scoped task queue
        └── {task-id}.json
```

You can override the base directory with `OPENCODE_TEAMS_DIR` environment variable.

## Available Skills

### spawn-team

Create and manage teams of AI agents.

**Key Functions:**
- Create teams
- Discover existing teams
- Join teams
- Get team information

See: [skills/spawn-team/SKILL.md](skills/spawn-team/SKILL.md)

### team-communicate

Send messages and coordinate between team members.

**Key Functions:**
- Send direct messages
- Broadcast to all members
- Read incoming messages
- Communication patterns

See: [skills/team-communicate/SKILL.md](skills/team-communicate/SKILL.md)

### team-coordinate

Manage tasks and coordinate work distribution.

**Key Functions:**
- Create tasks
- List and filter tasks
- Claim tasks
- Update task status
- Work distribution patterns

See: [skills/team-coordinate/SKILL.md](skills/team-coordinate/SKILL.md)

## Available Agents

### team-leader

Orchestrate and coordinate teams. Responsible for:
- Task decomposition
- Work distribution
- Progress monitoring
- Result synthesis

See: [agent/team-leader/AGENT.md](agent/team-leader/AGENT.md)

### team-worker

Execute tasks from the queue. Responsible for:
- Discovering work
- Claiming tasks
- Completing work
- Reporting progress

See: [agent/team-worker/AGENT.md](agent/team-worker/AGENT.md)

### code-reviewer

Specialized code review agent. Can focus on:
- Security vulnerabilities
- Performance issues
- Code style
- Business logic
- Test coverage

See: [agent/code-reviewer/AGENT.md](agent/code-reviewer/AGENT.md)

## Example Use Cases

### 1. Code Review Team

Parallel code review by specialized reviewers:

```javascript
// Leader creates team and review tasks
const team = global.TeamOperations.spawnTeam('code-review-pr-789');

['security', 'performance', 'style', 'logic'].forEach(aspect => {
  global.TaskOperations.createTask('code-review-pr-789', {
    title: `${aspect} review`,
    specialization: aspect
  });
});

// Specialists claim their areas
// Leader synthesizes results
```

See full example: [examples/code-review-team.md](examples/code-review-team.md)

### 2. Refactoring Team

Self-organizing workers refactor multiple files:

```javascript
// Leader creates team and discovers files
const team = global.TeamOperations.spawnTeam('refactor-services');
const files = ['ServiceA.js', 'ServiceB.js', /* ... */];

// Create task per file
files.forEach(file => {
  global.TaskOperations.createTask('refactor-services', {
    title: `Refactor ${file}`,
    file: `src/services/${file}`
  });
});

// Workers independently claim and complete tasks
```

### 3. Deployment Checklist

Parallel pre-deployment verification:

```javascript
const team = global.TeamOperations.spawnTeam('deploy-v2.1');

['tests', 'security-scan', 'migrations', 'config'].forEach(check => {
  global.TaskOperations.createTask('deploy-v2.1', {
    title: check,
    priority: 'critical'
  });
});

// Multiple agents run checks in parallel
// Leader verifies all pass before deploying
```

## Environment Variables

Set these to provide context for your agents:

- `OPENCODE_TEAM_NAME` - Current team context
- `OPENCODE_AGENT_ID` - Unique agent identifier
- `OPENCODE_AGENT_NAME` - Display name for agent
- `OPENCODE_AGENT_TYPE` - Role (leader, worker, specialist)
- `OPENCODE_TEAMS_DIR` - Override plugin data directory (default: `~/.config/opencode/opencode-teams`)

## Common Patterns

### Leader Pattern
One orchestrator, multiple specialists. Leader decomposes work and synthesizes results.

### Swarm Pattern
Workers self-organize around shared task queue. Best for parallel, independent tasks.

### Pipeline Pattern
Sequential processing with handoffs. Tasks have dependencies via `blockedBy`.

### Council Pattern
Multiple agents tackle same problem from different angles. Leader picks best solution.

### Watchdog Pattern
Worker performs task, watcher monitors. Can trigger rollback on issues.

## Development

### Adding New Skills

1. Create directory: `skills/my-skill/`
2. Add `SKILL.md` with YAML frontmatter
3. Document usage and examples
4. Reference in `opencode.json`

### Adding New Agents

1. Create directory: `agent/my-agent/`
2. Add `AGENT.md` with YAML frontmatter
3. Define responsibilities and workflow
4. Provide usage examples

### Testing

Test the plugin with a simple workflow:

```javascript
// Create test team
const team = global.TeamOperations.spawnTeam('test-team');
console.log('Team created:', team);

// Create test task
const task = global.TaskOperations.createTask('test-team', {
  title: 'Test task'
});
console.log('Task created:', task);

// List tasks
const tasks = global.TaskOperations.getTasks('test-team');
console.log('Tasks:', tasks);

// Clean up
global.TeamOperations.cleanup('test-team');
```

## Research Background

This plugin is inspired by Claude Code's TeammateTool feature, discovered through binary analysis. See [RESEARCH.md](RESEARCH.md) for detailed analysis of:

- TeammateTool operations
- File-based coordination
- Common patterns and use cases
- Failure handling
- Implementation details

## Development

This plugin is built using TypeScript following the [bun-module](https://github.com/zenobi-us/bun-module) structure.

### Setup

```bash
git clone https://github.com/rothnic/opencode-teams.git
cd opencode-teams
bun install
```

### Build

```bash
mise run build
```

This compiles TypeScript from `src/` to JavaScript in `dist/`.

### Type Checking

```bash
mise run typecheck
```

### Other Commands

- `mise run lint` - Lint code with ESLint
- `mise run lint:fix` - Fix linting issues
- `mise run format` - Format code with Prettier
- `mise run test` - Run tests

### Project Structure

- `src/` - TypeScript source code
- `dist/` - Compiled JavaScript output (generated, not committed)
- `skills/` - Skill definitions (markdown with YAML frontmatter)
- `agent/` - Agent templates (markdown with YAML frontmatter)
- `examples/` - Example workflows and usage patterns

## Contributing

Contributions welcome! Areas for improvement:

- Additional agent templates
- More example workflows
- UI/visualization for team status
- Advanced coordination patterns
- Performance optimizations

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode Plugins Guide](https://opencode.ai/docs/plugins/)
- [OpenCode Skills Guide](https://opencode.ai/docs/skills/)
- [TeammateTool Research](https://gist.github.com/kieranklaassen/d2b35569be2c7f1412c64861a219d51f)
- [Bun Module Template](https://github.com/zenobi-us/bun-module)
