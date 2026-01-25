# opencode-teams

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
- **Bun Native**: Uses Bun's built-in APIs for optimal performance

## Prerequisites

- [Bun](https://bun.sh) >= 1.3.2
- [mise](https://mise.jdx.dev/) (optional, for task running)

## Quick Start

### Installation

```bash
# Install via npm/bun
bun add opencode-teams
# or
npm install opencode-teams
```

Or reference directly in your `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

### For Development

```bash
# Clone repository
git clone https://github.com/rothnic/opencode-teams.git
cd opencode-teams

# Setup (installs dependencies and git hooks)
bun install
npm run setup

# Build
bun run build

# Test
bun test

# Lint
bun run lint
```

## Development

### Available Commands

Using mise (recommended):
```bash
mise run setup      # Initial setup with git hooks
mise run build      # Build the module
mise run test       # Run tests
mise run lint       # Lint code
mise run lint:fix   # Fix linting issues
mise run format     # Format code with Prettier
mise run typecheck  # Type check without emitting
```

Using bun directly:
```bash
bun install         # Install dependencies
bun test            # Run tests
bun run build       # Build via mise
```

Using npm scripts:
```bash
npm run setup       # Setup project
npm run build       # Build
npm test            # Test
npm run lint        # Lint
```

### Git Hooks

This project uses [Lefthook](https://github.com/evilmartians/lefthook) for git hooks:

- **pre-commit**: Runs linting, formatting, and type-checking
- **pre-push**: Runs tests and builds

Hooks are installed automatically during `mise run setup` or `npm run setup`.

## Project Structure

```
opencode-teams/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utility functions (Bun APIs)
│   ├── operations/     # Team and Task operations
│   └── index.ts        # Plugin entry point
├── tests/              # Unit and integration tests
├── docs/               # Documentation
├── agent/              # Agent templates
├── skills/             # Skill definitions
├── examples/           # Example workflows
└── dist/               # Built output (generated)
```

## Documentation

- [Installation Guide](docs/INSTALL.md)
- [Quick Start](docs/QUICKSTART.md)
- [Implementation Summary](docs/SUMMARY.md)
- [Research Background](docs/RESEARCH.md)
- [Agent Development](docs/AGENTS.md)

## Core Operations

### TeamOperations

- `spawnTeam(teamName, leaderInfo)` - Create new team
- `discoverTeams()` - List available teams
- `requestJoin(teamName, agentInfo)` - Join a team
- `getTeamInfo(teamName)` - Get team details
- `write(teamName, targetAgentId, message)` - Direct message
- `broadcast(teamName, message)` - Message all members
- `readMessages(teamName, agentId)` - Read your messages
- `cleanup(teamName)` - Remove team data

### TaskOperations

- `createTask(teamName, taskData)` - Create new task
- `getTasks(teamName, filters)` - List tasks
- `updateTask(teamName, taskId, updates)` - Update task
- `claimTask(teamName, taskId)` - Claim a task

## Example Use Cases

### Code Review Team

```javascript
// Leader creates team and review tasks
const team = global.TeamOperations.spawnTeam('code-review-pr-789');

['security', 'performance', 'style', 'logic'].forEach(aspect => {
  global.TaskOperations.createTask('code-review-pr-789', {
    title: `${aspect} review`,
    specialization: aspect
  });
});
```

See [examples/](examples/) for more workflows.

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/team-operations.test.ts

# Run integration test
./tests/integration.sh
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (following conventional commits)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Links

- [OpenCode Documentation](https://opencode.ai/docs/)
- [Bun Documentation](https://bun.sh/docs)
- [Bun Module Template](https://github.com/zenobi-us/bun-module)
