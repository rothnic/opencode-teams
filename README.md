# opencode-teams

Multi-agent team coordination plugin for [OpenCode](https://opencode.ai), inspired by Claude Code's TeammateTool feature.

**For AI Agents**: This plugin enables you to collaborate with other AI agents through teams, shared task queues, and inter-agent messaging.

**For Developers**: This plugin adds team coordination capabilities to OpenCode, allowing AI agents to work together on complex tasks.

Built with TypeScript and Bun following modern best practices.

## What This Plugin Does

OpenCode Teams provides coordination primitives for AI agents:

- **Teams**: Create and join teams for collaborative work
- **Task Queues**: Share work across team members via task queues
- **Messaging**: Send direct messages or broadcast to all team members
- **Roles**: Support for leaders, workers, and specialized agents

AI agents use these via **skills** (spawn-team, team-communicate, team-coordinate) that the plugin provides.

## For AI Agents Using This Plugin

Once this plugin is installed in OpenCode, you can:

1. **Create or join teams** using the `spawn-team` skill
2. **Claim and complete tasks** using the `team-coordinate` skill
3. **Message other agents** using the `team-communicate` skill

See the [skills directory](skills/) for detailed documentation on each capability.

## For Developers Installing This Plugin

### Prerequisites

- [Bun](https://bun.sh) >= 1.3.2 (for development)
- [OpenCode](https://opencode.ai)

### Installation

#### Via npm/bun Registry

```bash
npm install opencode-teams
# or
bun add opencode-teams
```

Then add to your `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

#### Local Development Install

```bash
# Clone to OpenCode's plugins directory
git clone https://github.com/rothnic/opencode-teams.git ~/.config/opencode/plugins/opencode-teams
cd ~/.config/opencode/plugins/opencode-teams

# Install and build
bun install
mise run build
```

Then reference in your `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

### Verification

After installation, OpenCode should recognize:

- `TeamOperations` and `TaskOperations` global objects
- Skills: spawn-team, team-communicate, team-coordinate
- Agent templates: team-leader, team-worker, code-reviewer

## Project Structure

```
opencode-teams/
├── src/                # Plugin source code
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utility functions (Bun APIs)
│   ├── operations/     # Team and Task operations
│   └── index.ts        # Plugin entry point
├── skills/             # Skill definitions for AI agents
├── agent/              # Agent role templates
├── examples/           # Example workflows
├── tests/              # Unit and integration tests
├── docs/               # Developer documentation
└── dist/               # Built output (generated)
```

## Development

### Setup

```bash
git clone https://github.com/rothnic/opencode-teams.git
cd opencode-teams
bun install
mise run setup  # Installs git hooks
```

### Common Commands

```bash
# Build
mise run build

# Test
bun test

# Lint and format
mise run lint:fix
mise run format

# Type check
mise run typecheck
```

### Using mise (Recommended)

[mise](https://mise.jdx.dev/) provides consistent task running:

```bash
mise run setup      # Initial setup with git hooks
mise run build      # Build TypeScript
mise run test       # Run tests
mise run lint       # Check code style
mise run lint:fix   # Auto-fix linting issues
mise run format     # Format with Prettier
mise run typecheck  # Type check without emitting
```

### Using npm Scripts

```bash
npm run setup       # Setup project
npm run build       # Build
npm test            # Test
npm run lint        # Lint
```

## Documentation

- **For AI Agents**: See [skills/](skills/) directory for how to use the coordination features
- **For Developers**: See [docs/](docs/) directory for:
  - [Installation Guide](docs/INSTALL.md)
  - [Quick Start](docs/QUICKSTART.md)
  - [Development Guide](docs/DEVELOPMENT.md)
  - [Implementation Details](docs/SUMMARY.md)
  - [Research Background](docs/RESEARCH.md)

## Example Use Case

**Scenario**: Code review by specialized agents

```
1. Leader Agent creates team:
   - Uses spawn-team skill to create 'review-pr-123'
   - Creates tasks: security-review, performance-review, style-review

2. Specialist Agents join:
   - Security specialist joins team, claims security-review task
   - Performance specialist joins team, claims performance-review task
   - Style specialist joins team, claims style-review task

3. Agents complete work:
   - Each specialist completes their review
   - Uses team-communicate to share findings
   - Updates task status to 'completed'

4. Leader synthesizes:
   - Reads all messages
   - Combines findings into final review
```

See [examples/](examples/) for more workflow patterns.

## Architecture

### Plugin Design

- **Entry Point**: `src/index.ts` exports the plugin initializer
- **Global Operations**: TeamOperations and TaskOperations exposed to skills via `global` object
- **File-Based Storage**: Teams and tasks persisted in `~/.config/opencode/opencode-teams/`
- **Bun Native**: Uses Bun APIs (`Bun.spawnSync`, `Bun.write`, `Bun.file`) for performance

### OpenCode Integration

- **Plugin Registration**: Defined in `opencode.json` pointing to `./dist/index.js`
- **Lifecycle Hooks**: Responds to OpenCode events (session created/deleted, tool execution)
- **Skills**: Markdown files with YAML frontmatter describe capabilities for AI agents
- **Agents**: Pre-configured agent templates (leader, worker, reviewer roles)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes following our [development guide](docs/DEVELOPMENT.md)
4. Commit using [conventional commits](https://www.conventionalcommits.org/)
5. Push and open a Pull Request

### Git Hooks

Lefthook ensures quality:

- **pre-commit**: Runs linting, formatting, type-checking
- **pre-push**: Runs tests and build

Hooks install automatically via `mise run setup`.

## Testing

```bash
# Run all tests
bun test

# Run specific test
bun test tests/team-operations.test.ts

# Watch mode
bun test --watch

# Integration test (requires OpenCode installed)
./tests/integration.sh
```

## License

MIT License - see [LICENSE](LICENSE)

## Links

- [OpenCode Documentation](https://opencode.ai/docs/)
- [Bun Documentation](https://bun.sh/docs)
- [Plugin Template](https://github.com/zenobi-us/bun-module)
- [Issue Tracker](https://github.com/rothnic/opencode-teams/issues)
