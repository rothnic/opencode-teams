# Refactoring Team Example

This example demonstrates the **Swarm Pattern** where workers self-organize
around a shared task queue to complete a large refactoring project.

## Scenario

Refactor 20+ service files to use a new `BaseService` pattern.
Multiple workers claim tasks independently and work in parallel.

## Team Structure

- **Leader**: Creates team, generates task list, monitors progress
- **Workers**: Self-organize, claim tasks, complete refactoring independently

## Setup

### 1. Leader Creates Team and Task Queue

```javascript
// Leader initialization
process.env.OPENCODE_TEAM_NAME = 'refactor-services';
process.env.OPENCODE_AGENT_ID = 'refactor-leader';
process.env.OPENCODE_AGENT_NAME = 'Refactoring Coordinator';
process.env.OPENCODE_AGENT_TYPE = 'leader';

// Create team
const team = global.TeamOperations.spawnTeam('refactor-services', {
  agentId: 'refactor-leader',
  agentName: 'Refactoring Coordinator',
  agentType: 'leader',
});

console.log('Refactoring team created');
```

### 2. Discover Services to Refactor

```javascript
// Find all service files
const fs = require('fs');
const path = require('path');

const servicesDir = path.join(process.cwd(), 'src/services');
const serviceFiles = fs
  .readdirSync(servicesDir)
  .filter((f) => f.endsWith('Service.js'))
  .map((f) => path.basename(f, '.js'));

console.log(`Found ${serviceFiles.length} services to refactor`);
```

### 3. Create Tasks

```javascript
// Create a task for each service
serviceFiles.forEach((service, index) => {
  const task = global.TaskOperations.createTask('refactor-services', {
    title: `Refactor ${service}`,
    description: `Update ${service} to extend BaseService and use new patterns`,
    file: `src/services/${service}.js`,
    priority: index < 5 ? 'high' : 'normal', // First 5 are high priority
    estimatedTime: '30min',
  });

  console.log(`Created task ${task.id}: ${service}`);
});

// Announce to team
global.TeamOperations.broadcast(
  'refactor-services',
  `${serviceFiles.length} refactoring tasks created. Workers should claim and complete tasks independently.`
);
```

## Worker Workflow

### Worker 1: Join and Work

```javascript
// Worker initialization
process.env.OPENCODE_TEAM_NAME = 'refactor-services';
process.env.OPENCODE_AGENT_ID = 'refactor-worker-1';
process.env.OPENCODE_AGENT_NAME = 'Refactoring Worker 1';
process.env.OPENCODE_AGENT_TYPE = 'worker';

// Join team
global.TeamOperations.requestJoin('refactor-services', {
  agentId: 'refactor-worker-1',
  agentName: 'Refactoring Worker 1',
  agentType: 'worker',
});

console.log('Joined refactoring team');

// Work loop
while (true) {
  // Get pending tasks, prioritize high priority
  const pendingTasks = global.TaskOperations.getTasks('refactor-services', {
    status: 'pending',
  }).sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
  });

  if (pendingTasks.length === 0) {
    console.log('No more tasks available');
    break;
  }

  // Claim next task
  const task = pendingTasks[0];
  const claimedTask = global.TaskOperations.claimTask('refactor-services', task.id);

  console.log(`Claimed task ${task.id}: ${task.title}`);

  // Notify team
  global.TeamOperations.write(
    'refactor-services',
    'refactor-leader',
    `Started working on ${task.title}`
  );

  try {
    // Read the service file
    const fs = require('fs');
    const filePath = task.file;
    const content = fs.readFileSync(filePath, 'utf-8');

    // Perform refactoring
    // 1. Make class extend BaseService
    // 2. Move common methods to base class calls
    // 3. Update constructor
    // 4. Add proper error handling

    let refactoredContent = content;

    // Example transformation
    if (!content.includes('extends BaseService')) {
      refactoredContent = refactoredContent.replace(
        /class (\w+Service) {/,
        'class $1 extends BaseService {'
      );
    }

    // Write back
    fs.writeFileSync(filePath, refactoredContent);

    // Run tests to verify
    const { execSync } = require('child_process');
    const testOutput = execSync(`npm test -- ${filePath.replace('.js', '.test.js')}`, {
      encoding: 'utf-8',
    });

    // Mark complete
    global.TaskOperations.updateTask('refactor-services', task.id, {
      status: 'completed',
      result: 'Successfully refactored to use BaseService',
      testsPass: true,
      completedAt: new Date().toISOString(),
    });

    console.log(`Completed task ${task.id}`);

    // Notify leader
    global.TeamOperations.write(
      'refactor-services',
      'refactor-leader',
      `Completed ${task.title} - tests passing ✓`
    );
  } catch (error) {
    // Mark failed
    global.TaskOperations.updateTask('refactor-services', task.id, {
      status: 'failed',
      error: error.message,
      failedAt: new Date().toISOString(),
    });

    console.error(`Failed task ${task.id}:`, error.message);

    // Ask for help
    global.TeamOperations.write(
      'refactor-services',
      'refactor-leader',
      `Hit blocker on ${task.title}: ${error.message}`
    );

    // Release task back to queue for retry
    global.TaskOperations.updateTask('refactor-services', task.id, {
      status: 'pending',
      owner: null,
      note: 'Reset for retry after failure',
    });
  }
}

console.log('Worker 1 completed all available tasks');
```

### Worker 2 & 3: Same Pattern

Additional workers follow the same pattern, independently claiming and completing tasks:

```javascript
// Worker 2
process.env.OPENCODE_AGENT_ID = 'refactor-worker-2';
// ... same loop as Worker 1

// Worker 3
process.env.OPENCODE_AGENT_ID = 'refactor-worker-3';
// ... same loop as Worker 1
```

## Leader Monitoring

### Check Progress Periodically

```javascript
// Leader checks progress every 2 minutes
setInterval(
  () => {
    const allTasks = global.TaskOperations.getTasks('refactor-services');
    const pending = allTasks.filter((t) => t.status === 'pending');
    const inProgress = allTasks.filter((t) => t.status === 'in_progress');
    const completed = allTasks.filter((t) => t.status === 'completed');
    const failed = allTasks.filter((t) => t.status === 'failed');

    console.log(`Progress: ${completed.length}/${allTasks.length} complete`);
    console.log(`  Pending: ${pending.length}`);
    console.log(`  In Progress: ${inProgress.length}`);
    console.log(`  Failed: ${failed.length}`);

    // Check for stalled tasks
    const now = Date.now();
    const stalledTasks = inProgress.filter((task) => {
      const claimedTime = new Date(task.claimedAt).getTime();
      const minutesSinceClaim = (now - claimedTime) / 1000 / 60;
      return minutesSinceClaim > 10; // Stalled if no update for 10 minutes
    });

    if (stalledTasks.length > 0) {
      console.log(`Warning: ${stalledTasks.length} tasks appear stalled`);

      // Reset stalled tasks
      stalledTasks.forEach((task) => {
        global.TaskOperations.updateTask('refactor-services', task.id, {
          status: 'pending',
          owner: null,
          note: 'Reset due to timeout - no updates for 10+ minutes',
        });

        console.log(`Reset stalled task: ${task.title}`);
      });
    }

    // Check messages from workers
    const messages = global.TeamOperations.readMessages('refactor-services');
    const newMessages = messages.filter((m) => {
      const msgTime = new Date(m.timestamp).getTime();
      return (now - msgTime) / 1000 / 60 < 2; // Last 2 minutes
    });

    newMessages.forEach((msg) => {
      console.log(`Message from ${msg.from}: ${msg.message}`);
    });
  },
  2 * 60 * 1000
); // Every 2 minutes
```

### Handle Worker Questions

```javascript
// Check for messages requesting help
const messages = global.TeamOperations.readMessages('refactor-services');
const helpRequests = messages.filter(
  (m) =>
    m.message.toLowerCase().includes('blocker') ||
    m.message.toLowerCase().includes('help') ||
    m.message.toLowerCase().includes('stuck')
);

helpRequests.forEach((msg) => {
  console.log(`Help request from ${msg.from}: ${msg.message}`);

  // Respond with guidance
  global.TeamOperations.write(
    'refactor-services',
    msg.from,
    'Check the BaseService docs in docs/base-service.md. Let me know if you need more specific help.'
  );
});
```

### Final Synthesis

```javascript
// When all tasks complete
const allTasks = global.TaskOperations.getTasks('refactor-services');
const completed = allTasks.filter((t) => t.status === 'completed');
const failed = allTasks.filter((t) => t.status === 'failed');

if (completed.length + failed.length === allTasks.length) {
  console.log('All refactoring tasks processed!');

  // Generate summary report
  const summary = {
    total: allTasks.length,
    completed: completed.length,
    failed: failed.length,
    successRate: `${Math.round((completed.length / allTasks.length) * 100)}%`,
    completedServices: completed.map((t) => t.title),
    failedServices: failed.map((t) => ({ title: t.title, error: t.error })),
  };

  console.log('Refactoring Summary:', JSON.stringify(summary, null, 2));

  // Announce completion
  global.TeamOperations.broadcast(
    'refactor-services',
    `Refactoring complete! ${summary.completed}/${summary.total} services successfully refactored.`
  );

  // Clean up
  global.TeamOperations.cleanup('refactor-services');
  console.log('Team cleaned up');
}
```

## Key Benefits

1. **Self-Organization**: Workers independently choose tasks, no manual assignment
2. **Parallel Execution**: Multiple workers process tasks simultaneously
3. **Fault Tolerance**: Failed tasks can be retried by other workers
4. **Automatic Recovery**: Stalled tasks are detected and reset
5. **Scalability**: Add more workers to speed up completion
6. **Priority Handling**: High priority tasks processed first

## Timing Example

With 20 services and 3 workers:

- Sequential: ~10 hours (20 × 30min)
- Parallel (3 workers): ~3.5 hours (20 / 3 × 30min)
- With coordination overhead: ~4 hours actual

## Tips

1. **Start with high priority**: Workers prioritize critical services first
2. **Monitor for stalls**: Detect and reset abandoned tasks
3. **Test after each change**: Verify refactoring doesn't break functionality
4. **Keep workers homogeneous**: All workers follow same refactoring pattern
5. **Handle failures gracefully**: Reset failed tasks for retry
6. **Communicate progress**: Workers report status to keep leader informed
