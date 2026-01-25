---
name: spawn-team
description: Create and manage a team of AI agents for collaborative work
author: OpenCode Teams Plugin
version: 1.0.0
---

# Spawn Team Skill

This skill enables you to create and manage teams of AI agents that can work together on complex tasks.

## Usage

### Creating a New Team

To create a new team:

```javascript
const team = global.TeamOperations.spawnTeam('my-team', {
  agentId: 'leader-1',
  agentName: 'Team Leader',
  agentType: 'leader'
});
```

### Discovering Existing Teams

To see what teams are available:

```javascript
const teams = global.TeamOperations.discoverTeams();
console.log('Available teams:', teams);
```

### Joining a Team

To join an existing team:

```javascript
const member = global.TeamOperations.requestJoin('my-team', {
  agentId: 'worker-1',
  agentName: 'Worker Agent',
  agentType: 'worker'
});
```

### Getting Team Information

To get details about a team:

```javascript
const info = global.TeamOperations.getTeamInfo('my-team');
console.log('Team info:', info);
```

## Environment Variables

- `OPENCODE_TEAM_NAME`: Current team context
- `OPENCODE_AGENT_ID`: Unique identifier for this agent
- `OPENCODE_AGENT_NAME`: Display name for this agent
- `OPENCODE_AGENT_TYPE`: Role of this agent (leader, worker, specialist)

## Examples

### Example 1: Code Review Team

```javascript
// Leader creates team
const team = global.TeamOperations.spawnTeam('code-review-pr-123');

// Spawn specialist reviewers
// (In practice, you would spawn these as separate agent sessions)
// Each would join with: requestJoin('code-review-pr-123', {...})
```

### Example 2: Refactoring Team

```javascript
// Create team for large refactoring task
const team = global.TeamOperations.spawnTeam('refactor-services');

// Leader can then spawn workers who will join the team
// Workers discover tasks via TaskOperations
```

## Tips

1. **Use descriptive team names** - Include the task or PR number
2. **Set agent types appropriately** - Helps with coordination
3. **Clean up when done** - Use `cleanup()` to remove team data
4. **Use environment variables** - Makes it easier to track context

## Related Skills

- `team-communicate`: Send messages between team members
- `team-coordinate`: Manage tasks and work distribution
