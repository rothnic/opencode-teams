---
name: team-communicate
description: Send messages and coordinate between team members
author: OpenCode Teams Plugin
version: 1.0.0
---

# Team Communicate Skill

This skill enables team members to send messages to each other, enabling coordination and information sharing.

## Usage

### Sending Direct Messages

To send a message to a specific team member:

```javascript
const message = global.TeamOperations.write(
  'my-team',
  'target-agent-id',
  'Please review the changes in src/api/',
  'sender-agent-id'
);
```

### Broadcasting to All Members

To send a message to all team members:

```javascript
const broadcast = global.TeamOperations.broadcast(
  'my-team',
  'All tests passing, ready for review'
);
```

### Reading Messages

To read messages addressed to you:

```javascript
const messages = global.TeamOperations.readMessages('my-team', 'your-agent-id');

messages.forEach(msg => {
  console.log(`From ${msg.from}: ${msg.message}`);
});
```

### Reading Messages (Automatic Agent ID)

If `OPENCODE_AGENT_ID` environment variable is set:

```javascript
// Uses process.env.OPENCODE_AGENT_ID automatically
const messages = global.TeamOperations.readMessages('my-team');
```

## Message Format

Messages are stored as JSON with the following structure:

```json
{
  "from": "sender-agent-id",
  "to": "recipient-agent-id",
  "message": "The actual message content",
  "timestamp": "2026-01-25T21:00:00.000Z"
}
```

Broadcast messages include a `recipients` array with all team member IDs.

## Communication Patterns

### 1. Leader Orchestration

Leader sends instructions to workers:

```javascript
// Leader broadcasts task
global.TeamOperations.broadcast('my-team', 'Starting refactoring phase');

// Leader sends specific instruction
global.TeamOperations.write('my-team', 'worker-1', 'Focus on service layer');
```

### 2. Worker Reporting

Workers report status back to leader:

```javascript
global.TeamOperations.write('my-team', 'leader', 'Completed 10/20 files');
```

### 3. Peer Coordination

Workers communicate with each other:

```javascript
global.TeamOperations.write(
  'my-team',
  'worker-2',
  'I finished auth module, starting on payments'
);
```

### 4. Announcements

Any member can broadcast important updates:

```javascript
global.TeamOperations.broadcast('my-team', 'Tests are failing, pausing work');
```

## Examples

### Example 1: Code Review Workflow

```javascript
// Reviewer finds issue
global.TeamOperations.write(
  'code-review',
  'leader',
  'Found security vulnerability in auth.js line 45'
);

// Leader broadcasts to team
global.TeamOperations.broadcast(
  'code-review',
  'Security issue found - all reviewers please check auth patterns'
);
```

### Example 2: Deployment Coordination

```javascript
// Pre-flight checker reports
global.TeamOperations.write('deploy', 'leader', 'All tests passing ✓');
global.TeamOperations.write('deploy', 'leader', 'Security scan clean ✓');
global.TeamOperations.write('deploy', 'leader', 'Migration safe ✓');

// Leader broadcasts go-ahead
global.TeamOperations.broadcast('deploy', 'All checks passed, proceeding with deployment');
```

## Tips

1. **Keep messages concise** - Focus on actionable information
2. **Use agent IDs consistently** - Helps with message routing
3. **Check messages regularly** - Workers should poll for new messages
4. **Include context** - Reference file names, line numbers, etc.
5. **Use broadcasts sparingly** - Reserve for important announcements

## Related Skills

- `spawn-team`: Create and manage teams
- `team-coordinate`: Manage tasks and work distribution
