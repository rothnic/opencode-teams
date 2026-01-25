# Quick Start Guide

Get started with OpenCode Teams in 5 minutes!

## Installation

```bash
# Option 1: Project-specific installation
cd your-project
git clone https://github.com/rothnic/opencode-teams.git .opencode/plugins/opencode-teams

# Option 2: Global installation
mkdir -p ~/.config/opencode/plugins
cd ~/.config/opencode/plugins
git clone https://github.com/rothnic/opencode-teams.git
```

## Configuration

Create or edit `opencode.json`:

```json
{
  "plugin": ["./. opencode/plugins/opencode-teams/plugin/index.js"],
  "skills": {
    "allow": ["*"],
    "directories": ["./.opencode/plugins/opencode-teams/skills"]
  },
  "agents": {
    "directories": ["./.opencode/plugins/opencode-teams/agent"]
  }
}
```

## Your First Team (5-Minute Example)

### Step 1: Create a Team

```javascript
// Set up as team leader
process.env.OPENCODE_TEAM_NAME = 'demo-team';
process.env.OPENCODE_AGENT_ID = 'leader';

// Create the team
const team = global.TeamOperations.spawnTeam('demo-team', {
  agentId: 'leader',
  agentName: 'Demo Leader'
});

console.log('✓ Team created:', team.name);
```

### Step 2: Create Some Tasks

```javascript
// Create a few demo tasks
const tasks = [
  'Review authentication code',
  'Check database queries',
  'Update documentation'
].map(title => {
  return global.TaskOperations.createTask('demo-team', {
    title: title,
    priority: 'normal'
  });
});

console.log(`✓ Created ${tasks.length} tasks`);
```

### Step 3: Simulate a Worker

```javascript
// Switch to worker role
process.env.OPENCODE_AGENT_ID = 'worker-1';

// Join the team
global.TeamOperations.requestJoin('demo-team', {
  agentId: 'worker-1',
  agentName: 'Demo Worker'
});

// Get pending tasks
const pending = global.TaskOperations.getTasks('demo-team', { 
  status: 'pending' 
});

console.log(`✓ Found ${pending.length} pending tasks`);

// Claim first task
const task = pending[0];
const claimed = global.TaskOperations.claimTask('demo-team', task.id);

console.log(`✓ Claimed: ${claimed.title}`);

// Complete the task
global.TaskOperations.updateTask('demo-team', task.id, {
  status: 'completed',
  result: 'Task done!'
});

console.log('✓ Task completed!');
```

### Step 4: Team Communication

```javascript
// Worker sends message to leader
global.TeamOperations.write(
  'demo-team',
  'leader',
  'First task complete! Ready for more.'
);

console.log('✓ Message sent to leader');

// Leader broadcasts to team
process.env.OPENCODE_AGENT_ID = 'leader';
global.TeamOperations.broadcast(
  'demo-team',
  'Great work everyone! Keep it up.'
);

console.log('✓ Broadcast sent to team');

// Read messages
const messages = global.TeamOperations.readMessages('demo-team');
console.log(`✓ Read ${messages.length} messages`);
```

### Step 5: Clean Up

```javascript
// Remove team when done
global.TeamOperations.cleanup('demo-team');
console.log('✓ Team cleaned up');
```

## What Just Happened?

1. **Created a team** - Leader initialized team coordination
2. **Generated tasks** - Created a shared work queue
3. **Worker joined** - Agent joined team and claimed work
4. **Completed work** - Task progressed through workflow
5. **Communicated** - Team members exchanged messages
6. **Cleaned up** - Removed team data

## Next Steps

### Try Real Examples

1. **Code Review Team** - See `examples/code-review-team.md`
   - Multiple specialized reviewers
   - Parallel review of different aspects
   - Synthesized feedback

2. **Refactoring Team** - See `examples/refactoring-team.md`
   - Self-organizing workers
   - Shared task queue
   - Parallel execution

3. **Deployment Team** - See `examples/deployment-team.md`
   - Pre-flight verification
   - Gate control
   - Automated deployment

### Explore Skills

- **spawn-team** - Team creation and management
- **team-communicate** - Inter-agent messaging
- **team-coordinate** - Task management

See detailed docs in `skills/*/SKILL.md`

### Use Agent Templates

- **team-leader** - Orchestration and coordination
- **team-worker** - Task execution
- **code-reviewer** - Specialized review

See detailed docs in `agent/*/AGENT.md`

### Common Patterns

**Leader Pattern**
```javascript
// One orchestrator + multiple specialists
const team = global.TeamOperations.spawnTeam('my-team');
// Create tasks
// Spawn specialists
// Monitor and synthesize
```

**Swarm Pattern**
```javascript
// Workers self-organize around queue
// Create many tasks
// Workers claim independently
// Auto-recovery from failures
```

**Pipeline Pattern**
```javascript
// Sequential with dependencies
const task1 = global.TaskOperations.createTask('team', {...});
const task2 = global.TaskOperations.createTask('team', {
  blockedBy: [task1.id]
});
```

## Environment Variables

Set these for better agent context:

```bash
export OPENCODE_TEAM_NAME="my-team"
export OPENCODE_AGENT_ID="agent-1"
export OPENCODE_AGENT_NAME="My Agent"
export OPENCODE_AGENT_TYPE="worker"
```

## Verification

Test your installation:

```javascript
// Should output "object"
console.log(typeof global.TeamOperations);

// Should output "object"
console.log(typeof global.TaskOperations);

// Should list team operations
console.log(Object.keys(global.TeamOperations));

// Should list task operations
console.log(Object.keys(global.TaskOperations));
```

## Troubleshooting

**TeamOperations is undefined**
- Check plugin path in `opencode.json`
- Verify plugin file exists
- Restart OpenCode

**Skills not loading**
- Check skills directory path
- Verify SKILL.md files have YAML frontmatter
- Check file permissions

**Can't create teams**
- Check write permissions on `~/.opencode/`
- Verify disk space
- Check error messages in console

## Getting Help

- **Full Documentation**: See [README.md](README.md)
- **Installation Details**: See [INSTALL.md](INSTALL.md)
- **Research Background**: See [RESEARCH.md](RESEARCH.md)
- **Example Workflows**: See `examples/*.md`
- **Skills Documentation**: See `skills/*/SKILL.md`
- **Agent Templates**: See `agent/*/AGENT.md`

## Resources

- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode Plugins](https://opencode.ai/docs/plugins/)
- [TeammateTool Research](https://gist.github.com/kieranklaassen/d2b35569be2c7f1412c64861a219d51f)

## Summary

You now have:
- ✅ Multi-agent team coordination
- ✅ Shared task queues
- ✅ Inter-agent messaging
- ✅ 3 example workflows
- ✅ 3 skills
- ✅ 3 agent templates

Start building teams for your coding workflows!
