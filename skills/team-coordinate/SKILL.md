---
name: team-coordinate
description: Manage tasks and coordinate work distribution across team members
author: OpenCode Teams Plugin
version: 1.0.0
---

# Team Coordinate Skill

This skill enables task management and work distribution across team members using a shared task queue.

## Usage

### Creating Tasks

To create a new task:

```javascript
const task = global.TaskOperations.createTask('my-team', {
  title: 'Refactor UserService',
  description: 'Update UserService to use new BaseService pattern',
  priority: 'high',
  estimatedTime: '30min'
});
```

### Listing Tasks

To get all tasks:

```javascript
const allTasks = global.TaskOperations.getTasks('my-team');
```

To filter tasks by status:

```javascript
const pendingTasks = global.TaskOperations.getTasks('my-team', { status: 'pending' });
const inProgressTasks = global.TaskOperations.getTasks('my-team', { status: 'in_progress' });
const completedTasks = global.TaskOperations.getTasks('my-team', { status: 'completed' });
```

To filter tasks by owner:

```javascript
const myTasks = global.TaskOperations.getTasks('my-team', { owner: 'worker-1' });
```

### Claiming Tasks

Workers can claim tasks from the queue:

```javascript
// Claim a specific task
const claimedTask = global.TaskOperations.claimTask('my-team', taskId, 'worker-1');
```

With automatic agent ID:

```javascript
// Uses process.env.OPENCODE_AGENT_ID
const claimedTask = global.TaskOperations.claimTask('my-team', taskId);
```

### Updating Tasks

To update task status or information:

```javascript
const updated = global.TaskOperations.updateTask('my-team', taskId, {
  status: 'completed',
  result: 'Successfully refactored UserService',
  completedAt: new Date().toISOString()
});
```

## Task States

Tasks progress through these states:

1. **pending** - Created but not yet claimed
2. **in_progress** - Claimed by a worker
3. **completed** - Successfully finished
4. **failed** - Encountered error or couldn't complete
5. **blocked** - Waiting on dependencies

## Work Distribution Patterns

### 1. The Swarm Pattern

Workers self-organize and claim tasks:

```javascript
// Leader creates multiple tasks
const tasks = [
  { title: 'Refactor ServiceA', description: '...' },
  { title: 'Refactor ServiceB', description: '...' },
  { title: 'Refactor ServiceC', description: '...' }
];

tasks.forEach(task => global.TaskOperations.createTask('refactor', task));

// Workers independently claim and complete tasks
```

### 2. The Pipeline Pattern

Tasks with dependencies:

```javascript
// Task 1: Design API
const task1 = global.TaskOperations.createTask('feature', {
  title: 'Design API endpoints',
  blockedBy: []
});

// Task 2: Implement backend (blocked by task 1)
const task2 = global.TaskOperations.createTask('feature', {
  title: 'Implement backend',
  blockedBy: [task1.id]
});

// Task 3: Implement frontend (blocked by task 2)
const task3 = global.TaskOperations.createTask('feature', {
  title: 'Implement frontend',
  blockedBy: [task2.id]
});
```

### 3. The Parallel Pattern

Independent tasks that can run simultaneously:

```javascript
// All tasks can start immediately
const tasks = ['login', 'profile', 'settings', 'dashboard'].map(feature => 
  global.TaskOperations.createTask('ui-update', {
    title: `Update ${feature} page`,
    priority: 'normal'
  })
);
```

## Examples

### Example 1: Refactoring Team

```javascript
// Leader: Create team and tasks
global.TeamOperations.spawnTeam('refactor-services');

// Discover all service files
const services = ['UserService', 'AuthService', 'PaymentService', /* ... */];

// Create task for each service
services.forEach(service => {
  global.TaskOperations.createTask('refactor-services', {
    title: `Refactor ${service}`,
    description: `Update ${service} to use BaseService pattern`,
    file: `src/services/${service}.js`
  });
});

// Workers claim and complete tasks
// Worker 1:
const task = global.TaskOperations.getTasks('refactor-services', { status: 'pending' })[0];
global.TaskOperations.claimTask('refactor-services', task.id);
// ... do the work ...
global.TaskOperations.updateTask('refactor-services', task.id, { status: 'completed' });
```

### Example 2: Code Review with Task Assignment

```javascript
// Create review tasks for different aspects
const reviewTasks = [
  { title: 'Security review', description: 'Check for vulnerabilities' },
  { title: 'Performance review', description: 'Check for performance issues' },
  { title: 'Style review', description: 'Check code style and consistency' },
  { title: 'Logic review', description: 'Verify business logic' }
];

reviewTasks.forEach(task => 
  global.TaskOperations.createTask('code-review-pr-123', task)
);

// Specialized agents claim their area
// Security specialist claims security task, etc.
```

### Example 3: Deployment Checklist

```javascript
// Pre-deployment tasks that must all complete
const deployTasks = [
  { title: 'Run test suite', priority: 'critical' },
  { title: 'Security scan', priority: 'critical' },
  { title: 'Check migrations', priority: 'critical' },
  { title: 'Verify config', priority: 'high' },
  { title: 'Update changelog', priority: 'normal' }
];

deployTasks.forEach(task => 
  global.TaskOperations.createTask('deploy-v2.1', task)
);

// Multiple agents work in parallel
// Leader monitors until all tasks complete
const pending = global.TaskOperations.getTasks('deploy-v2.1', { status: 'pending' });
if (pending.length === 0) {
  console.log('All pre-deployment tasks complete!');
}
```

## Task Recovery

If a worker crashes, tasks can be reassigned:

```javascript
// Find abandoned tasks (in_progress but no recent updates)
const allTasks = global.TaskOperations.getTasks('my-team');
const abandonedTasks = allTasks.filter(task => {
  if (task.status !== 'in_progress') return false;
  const lastUpdate = new Date(task.updatedAt || task.claimedAt);
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return lastUpdate < fiveMinutesAgo;
});

// Reset abandoned tasks
abandonedTasks.forEach(task => {
  global.TaskOperations.updateTask('my-team', task.id, {
    status: 'pending',
    owner: null,
    note: 'Reset due to timeout'
  });
});
```

## Tips

1. **Create granular tasks** - Smaller tasks are easier to distribute
2. **Use descriptive titles** - Makes it easy to understand task purpose
3. **Set priorities** - Helps workers choose important tasks first
4. **Track progress** - Update task status regularly
5. **Handle failures gracefully** - Mark failed tasks and include error details
6. **Monitor for stalls** - Implement timeout/recovery for abandoned tasks

## Related Skills

- `spawn-team`: Create and manage teams
- `team-communicate`: Send messages between team members
