---
name: spawn-team
description: Create and manage teams of AI agents for collaborative work
author: OpenCode Teams Plugin
version: 1.0.0
---

# Spawn Team Skill

Enables AI agents to create and coordinate teams for multi-agent collaboration.

## For AI Agents

When you need to work with other agents on a complex task, use this skill to:
- Create a new team
- Discover existing teams
- Join a team as a worker or specialist
- Get information about team members

## Available Operations

These operations are available via `global.TeamOperations`:

### Create a Team

**When to use**: You're starting a new collaborative task and need to coordinate with other agents.

```javascript
const team = global.TeamOperations.spawnTeam(teamName, leaderInfo);
```

**Parameters**:
- `teamName` (string): Unique identifier for the team
- `leaderInfo` (object, optional):
  - `agentId`: Your unique agent ID (defaults to env OPENCODE_AGENT_ID)
  - `agentName`: Your display name (defaults to env OPENCODE_AGENT_NAME)
  - `agentType`: Your role, typically 'leader'

**Returns**: TeamConfig object with team details

**Example**:
```javascript
// As a leader agent starting a code review
const team = global.TeamOperations.spawnTeam('code-review-pr-123', {
  agentId: process.env.OPENCODE_AGENT_ID,
  agentName: 'Review Coordinator',
  agentType: 'leader'
});
```

### Discover Teams

**When to use**: You want to find available teams to join.

```javascript
const teams = global.TeamOperations.discoverTeams();
```

**Returns**: Array of team summaries with name, leader, member count, and creation time

**Example**:
```javascript
// Find teams that need workers
const teams = global.TeamOperations.discoverTeams();
teams.forEach(team => {
  console.log(`Team: ${team.name}, Members: ${team.memberCount}`);
});
```

### Join a Team

**When to use**: You've been assigned to help with a team's work.

```javascript
const member = global.TeamOperations.requestJoin(teamName, agentInfo);
```

**Parameters**:
- `teamName` (string): Name of team to join
- `agentInfo` (object, optional):
  - `agentId`: Your unique ID
  - `agentName`: Your display name
  - `agentType`: Your role (worker, specialist, reviewer, etc.)

**Returns**: TeamMember object confirming your membership

**Example**:
```javascript
// Join as a security reviewer
const member = global.TeamOperations.requestJoin('code-review-pr-123', {
  agentId: process.env.OPENCODE_AGENT_ID,
  agentName: 'Security Specialist',
  agentType: 'security-reviewer'
});
```

### Get Team Info

**When to use**: You need details about a team's current state.

```javascript
const info = global.TeamOperations.getTeamInfo(teamName);
```

**Returns**: Full team configuration including all members

**Example**:
```javascript
const info = global.TeamOperations.getTeamInfo('code-review-pr-123');
console.log(`Leader: ${info.leader}`);
console.log(`Members: ${info.members.length}`);
```

## Environment Variables

OpenCode sets these environment variables for agent context:

- `OPENCODE_TEAM_NAME`: Current team you're working with
- `OPENCODE_AGENT_ID`: Your unique identifier
- `OPENCODE_AGENT_NAME`: Your display name
- `OPENCODE_AGENT_TYPE`: Your role in the team

## Workflow Patterns

### Leader Pattern

1. **Leader creates team**: `spawnTeam('task-name')`
2. **Leader breaks down work**: Create tasks using TaskOperations
3. **Workers discover team**: `discoverTeams()` finds available work
4. **Workers join team**: `requestJoin('task-name')`
5. **Workers claim tasks**: Use TaskOperations to get and complete work

### Swarm Pattern

1. **Any agent creates team**: First agent to start becomes coordinator
2. **Other agents discover and join**: `discoverTeams()` then `requestJoin()`
3. **Agents self-organize**: Workers claim tasks from shared queue
4. **No central control**: Agents work independently on parallel tasks

## Example: Code Review Workflow

```javascript
// Leader Agent
const team = global.TeamOperations.spawnTeam('code-review-pr-456');

// Create review tasks (using task-operations skill)
global.TaskOperations.createTask('code-review-pr-456', {
  title: 'Security Review',
  description: 'Check for security vulnerabilities',
  priority: 'high'
});

global.TaskOperations.createTask('code-review-pr-456', {
  title: 'Performance Review', 
  description: 'Check for performance issues',
  priority: 'medium'
});

// Worker Agents (in separate sessions)
// 1. Discover team
const teams = global.TeamOperations.discoverTeams();
const reviewTeam = teams.find(t => t.name === 'code-review-pr-456');

// 2. Join team
global.TeamOperations.requestJoin('code-review-pr-456', {
  agentType: 'security-reviewer'
});

// 3. Claim and complete task (see task-operations skill)
const tasks = global.TaskOperations.getTasks('code-review-pr-456', { status: 'pending' });
// ... claim and complete task
```

## Related Skills

- **team-communicate**: Send messages between team members
- **team-coordinate**: Manage tasks within a team

## Error Handling

All operations throw errors for invalid inputs:

```javascript
try {
  const team = global.TeamOperations.spawnTeam('my-team');
} catch (error) {
  console.error('Failed to create team:', error.message);
  // Team might already exist or invalid name
}
```

Common errors:
- Team already exists (when creating)
- Team does not exist (when joining/querying)
- Invalid team name (empty or invalid characters)
