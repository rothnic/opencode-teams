# Installation Guide

This guide will help you install and configure the OpenCode Teams plugin.

## Prerequisites

- OpenCode installed and configured
- Node.js 18+ (for building from source)
- npm or yarn package manager

## Recommended Installation

### From npm (when published)

```bash
npm install opencode-teams
```

Then reference in your `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

OpenCode will automatically handle the plugin discovery and initialization.

## Development Installation

If you want to develop or test the plugin locally:

### Global Installation

```bash
# Clone to OpenCode's global plugins directory
mkdir -p ~/.config/opencode/plugins
cd ~/.config/opencode/plugins
git clone https://github.com/rothnic/opencode-teams.git opencode-teams
cd opencode-teams

# Install dependencies and build
npm install
npm run build
```

Then reference in your `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

### Project-Specific Installation

```bash
# Clone to project's plugins directory
cd /path/to/your/project
mkdir -p .opencode/plugins
cd .opencode/plugins
git clone https://github.com/rothnic/opencode-teams.git opencode-teams
cd opencode-teams

# Install dependencies and build
npm install
npm run build
```

Then reference in project's `opencode.json`:

```json
{
  "plugin": ["opencode-teams"]
}
```

## Building

The plugin is written in TypeScript and must be built before use:

```bash
cd opencode-teams
npm install    # Install dependencies
npm run build  # Compile TypeScript to JavaScript
```

This creates the `dist/` directory with compiled JavaScript files.
## Verification

Start OpenCode and verify the plugin loaded:

```javascript
// Check if TeamOperations is available
console.log(typeof global.TeamOperations);
// Should output: "object"

// Check if TaskOperations is available
console.log(typeof global.TaskOperations);
// Should output: "object"

// Try creating a test team
const team = global.TeamOperations.spawnTeam('test-team');
console.log('Team created:', team);

// Clean up
global.TeamOperations.cleanup('test-team');
```

## Data Storage

The plugin stores all data in `~/.config/opencode/opencode-teams/`:

```
~/.config/opencode/opencode-teams/
├── teams/           # Team configurations and messages
└── tasks/           # Task queues
```

You can override this location by setting the `OPENCODE_TEAMS_DIR` environment variable.


## Configuration

### Environment Variables

Set these to provide context for your agents:

```bash
# Agent context (used during team operations)
export OPENCODE_TEAM_NAME="my-team"
export OPENCODE_AGENT_ID="agent-1"
export OPENCODE_AGENT_NAME="My Agent"
export OPENCODE_AGENT_TYPE="worker"

# Optional: Override plugin data directory
export OPENCODE_TEAMS_DIR="$HOME/.config/opencode/my-custom-teams-dir"
```

## Usage Examples

### Quick Test

Create a simple test to verify everything works:

```javascript
// 1. Create a team
const team = global.TeamOperations.spawnTeam('test-team', {
  agentId: 'test-leader',
  agentName: 'Test Leader',
  agentType: 'leader'
});
console.log('Created team:', team.name);

// 2. Create a task
const task = global.TaskOperations.createTask('test-team', {
  title: 'Test task',
  description: 'This is a test',
  priority: 'normal'
});
console.log('Created task:', task.title);

// 3. List tasks
const tasks = global.TaskOperations.getTasks('test-team');
console.log('Tasks:', tasks.length);

// 4. Claim the task
const claimed = global.TaskOperations.claimTask('test-team', task.id);
console.log('Claimed task:', claimed.title);

// 5. Complete the task
const updated = global.TaskOperations.updateTask('test-team', task.id, {
  status: 'completed',
  result: 'Test successful'
});
console.log('Updated task:', updated.status);

// 6. Send a message
const msg = global.TeamOperations.broadcast('test-team', 'Hello team!');
console.log('Sent message:', msg.message);

// 7. Read messages
const messages = global.TeamOperations.readMessages('test-team');
console.log('Messages:', messages.length);

// 8. Clean up
global.TeamOperations.cleanup('test-team');
console.log('Cleaned up team');
```

If all steps complete without errors, installation was successful!

### Load Example Workflows

Try the example workflows in the `examples/` directory:

- `code-review-team.md` - Multi-specialist code review
- `refactoring-team.md` - Parallel refactoring with worker swarm
- `deployment-team.md` - Pre-flight checks and deployment

## Troubleshooting

### Plugin Not Loading

**Problem**: TeamOperations is undefined

**Solutions**:
1. Check `opencode.json` has correct plugin path
2. Verify plugin file exists at specified path
3. Check OpenCode console for error messages
4. Ensure plugin path is relative to config file location

### Skills Not Available

**Problem**: Skills not showing in OpenCode

**Solutions**:
1. Verify skills directories in `opencode.json`
2. Check SKILL.md files have correct YAML frontmatter
3. Ensure skills are in subdirectories (e.g., `skills/spawn-team/SKILL.md`)
4. Check file permissions are readable

### Agents Not Loading

**Problem**: Agents not available

**Solutions**:
1. Verify agents directories in `opencode.json`
2. Check AGENT.md files have correct YAML frontmatter
3. Ensure agents are in subdirectories (e.g., `agent/team-leader/AGENT.md`)

### Permission Errors

**Problem**: Cannot create teams or tasks

**Solutions**:
1. Check write permissions on `~/.opencode/` directory
2. Verify OPENCODE_TEAMS_DIR and OPENCODE_TASKS_DIR are writable
3. Check disk space availability

### Environment Variables Not Working

**Problem**: Agent context not set correctly

**Solutions**:
1. Export environment variables before starting OpenCode
2. Use full variable names (e.g., `OPENCODE_TEAM_NAME` not `TEAM_NAME`)
3. Verify variables with `echo $OPENCODE_TEAM_NAME`

## Updating

### Update Local Installation

```bash
cd /path/to/plugins/opencode-teams
git pull origin main
```

### Update Global Installation

```bash
cd ~/.config/opencode/plugins/opencode-teams
git pull origin main
```

## Uninstalling

### Remove Project Installation

```bash
rm -rf /path/to/project/.opencode/plugins/opencode-teams
```

Edit `.opencode/opencode.json` and remove plugin references.

### Remove Global Installation

```bash
rm -rf ~/.config/opencode/plugins/opencode-teams
```

Edit `~/.config/opencode/opencode.json` and remove plugin references.

### Clean Up Data

```bash
# Remove team data
rm -rf ~/.opencode/teams

# Remove task data
rm -rf ~/.opencode/tasks
```

## Next Steps

1. **Read the Documentation**: Check out [README.md](README.md) for full feature overview
2. **Explore Skills**: Read skill documentation in `skills/*/SKILL.md`
3. **Try Agent Templates**: Review agent templates in `agent/*/AGENT.md`
4. **Run Examples**: Follow examples in `examples/*.md`
5. **Create Your Own**: Build custom teams for your workflows

## Getting Help

- Review [RESEARCH.md](RESEARCH.md) for background on TeammateTool
- Check example workflows in `examples/`
- Review skill and agent documentation
- Open an issue on GitHub for bugs or questions

## Contributing

Contributions welcome! See the main README.md for contribution guidelines.
