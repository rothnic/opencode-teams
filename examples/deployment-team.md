# Deployment Team Example

This example demonstrates the **Watchdog Pattern** where multiple verification agents run checks in parallel before allowing deployment to proceed.

## Scenario

Deploy a new version to production with comprehensive pre-flight checks. All checks must pass before deployment proceeds.

## Team Structure

- **Leader**: Orchestrates deployment process and makes go/no-go decision
- **Test Runner**: Runs full test suite
- **Security Scanner**: Runs security scans
- **Migration Checker**: Verifies database migrations
- **Performance Baseline**: Captures current performance metrics
- **Deployer**: Executes actual deployment (only if all checks pass)

## Setup

### 1. Leader Creates Team

```javascript
// Leader initialization
process.env.OPENCODE_TEAM_NAME = 'deploy-v2-1-0';
process.env.OPENCODE_AGENT_ID = 'deploy-leader';
process.env.OPENCODE_AGENT_NAME = 'Deployment Coordinator';
process.env.OPENCODE_AGENT_TYPE = 'leader';

// Create deployment team
const team = global.TeamOperations.spawnTeam('deploy-v2-1-0', {
  agentId: 'deploy-leader',
  agentName: 'Deployment Coordinator',
  agentType: 'leader',
});

console.log('Deployment team created for v2.1.0');
```

### 2. Create Pre-Flight Check Tasks

```javascript
// Create critical pre-flight checks
const preflightChecks = [
  {
    title: 'Run Test Suite',
    description: 'Run all tests and verify 100% pass',
    priority: 'critical',
    type: 'preflight',
    command: 'npm test',
  },
  {
    title: 'Security Scan',
    description: 'Run security scanners (npm audit, Snyk)',
    priority: 'critical',
    type: 'preflight',
    command: 'npm audit && snyk test',
  },
  {
    title: 'Check Migrations',
    description: 'Verify migrations are safe and reversible',
    priority: 'critical',
    type: 'preflight',
    command: 'npm run check-migrations',
  },
  {
    title: 'Performance Baseline',
    description: 'Capture current performance metrics',
    priority: 'high',
    type: 'preflight',
    command: 'npm run perf-baseline',
  },
  {
    title: 'Build Verification',
    description: 'Verify production build completes successfully',
    priority: 'critical',
    type: 'preflight',
    command: 'npm run build:prod',
  },
];

// Create tasks
preflightChecks.forEach((check) => {
  const task = global.TaskOperations.createTask('deploy-v2-1-0', check);
  console.log(`Created preflight check: ${task.title}`);
});

// Announce to team
global.TeamOperations.broadcast(
  'deploy-v2-1-0',
  'Pre-flight checks created. All checks must pass before deployment can proceed.'
);
```

## Pre-Flight Check Agents

### Test Runner Agent

```javascript
process.env.OPENCODE_AGENT_ID = 'test-runner';
process.env.OPENCODE_AGENT_NAME = 'Test Runner';

global.TeamOperations.requestJoin('deploy-v2-1-0', {
  agentId: 'test-runner',
  agentName: 'Test Runner',
  agentType: 'checker',
});

// Claim test task
const tasks = global.TaskOperations.getTasks('deploy-v2-1-0', { status: 'pending' });
const testTask = tasks.find((t) => t.title.includes('Test Suite'));
global.TaskOperations.claimTask('deploy-v2-1-0', testTask.id);

console.log('Running test suite...');

try {
  const { execSync } = require('child_process');
  const output = execSync('npm test', {
    encoding: 'utf-8',
    timeout: 10 * 60 * 1000, // 10 minute timeout
  });

  // Parse test results
  const passMatch = output.match(/(\d+) passing/);
  const failMatch = output.match(/(\d+) failing/);

  const passing = passMatch ? parseInt(passMatch[1]) : 0;
  const failing = failMatch ? parseInt(failMatch[1]) : 0;

  if (failing === 0 && passing > 0) {
    // Tests passed
    global.TaskOperations.updateTask('deploy-v2-1-0', testTask.id, {
      status: 'completed',
      result: 'passed',
      details: `All ${passing} tests passing`,
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      `✓ Test suite passed: ${passing} tests passing`
    );
  } else {
    // Tests failed
    global.TaskOperations.updateTask('deploy-v2-1-0', testTask.id, {
      status: 'completed',
      result: 'failed',
      details: `${failing} tests failing, ${passing} passing`,
      output: output,
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      `✗ TESTS FAILING: ${failing} failures. Deployment should be blocked.`
    );
  }
} catch (error) {
  global.TaskOperations.updateTask('deploy-v2-1-0', testTask.id, {
    status: 'completed',
    result: 'error',
    error: error.message,
    completedAt: new Date().toISOString(),
  });

  global.TeamOperations.write(
    'deploy-v2-1-0',
    'deploy-leader',
    `✗ Test suite error: ${error.message}`
  );
}
```

### Security Scanner Agent

```javascript
process.env.OPENCODE_AGENT_ID = 'security-scanner';
process.env.OPENCODE_AGENT_NAME = 'Security Scanner';

global.TeamOperations.requestJoin('deploy-v2-1-0', {
  agentId: 'security-scanner',
  agentName: 'Security Scanner',
  agentType: 'checker',
});

// Claim security task
const tasks = global.TaskOperations.getTasks('deploy-v2-1-0', { status: 'pending' });
const securityTask = tasks.find((t) => t.title.includes('Security'));
global.TaskOperations.claimTask('deploy-v2-1-0', securityTask.id);

console.log('Running security scans...');

try {
  const { execSync } = require('child_process');

  // Run npm audit
  let auditOutput;
  try {
    auditOutput = execSync('npm audit --json', { encoding: 'utf-8' });
  } catch (e) {
    auditOutput = e.stdout; // npm audit exits with error if vulnerabilities found
  }

  const auditResults = JSON.parse(auditOutput);
  const vulnerabilities = auditResults.metadata?.vulnerabilities || {};
  const critical = vulnerabilities.critical || 0;
  const high = vulnerabilities.high || 0;
  const moderate = vulnerabilities.moderate || 0;
  const low = vulnerabilities.low || 0;

  const totalVulns = critical + high + moderate + low;

  if (totalVulns === 0) {
    global.TaskOperations.updateTask('deploy-v2-1-0', securityTask.id, {
      status: 'completed',
      result: 'passed',
      details: 'No vulnerabilities found',
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      '✓ Security scan passed: No vulnerabilities found'
    );
  } else if (critical > 0 || high > 0) {
    global.TaskOperations.updateTask('deploy-v2-1-0', securityTask.id, {
      status: 'completed',
      result: 'failed',
      details: `${totalVulns} vulnerabilities: ${critical} critical, ${high} high, ${moderate} moderate, ${low} low`,
      vulnerabilities: auditResults.vulnerabilities,
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      `✗ SECURITY ISSUES: ${critical} critical, ${high} high severity. Deployment should be blocked.`
    );
  } else {
    global.TaskOperations.updateTask('deploy-v2-1-0', securityTask.id, {
      status: 'completed',
      result: 'passed_with_warnings',
      details: `${totalVulns} low/moderate vulnerabilities`,
      vulnerabilities: auditResults.vulnerabilities,
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      `⚠ Security scan: ${moderate} moderate, ${low} low severity issues. Review recommended.`
    );
  }
} catch (error) {
  global.TaskOperations.updateTask('deploy-v2-1-0', securityTask.id, {
    status: 'completed',
    result: 'error',
    error: error.message,
    completedAt: new Date().toISOString(),
  });

  global.TeamOperations.write(
    'deploy-v2-1-0',
    'deploy-leader',
    `✗ Security scan error: ${error.message}`
  );
}
```

### Migration Checker Agent

```javascript
process.env.OPENCODE_AGENT_ID = 'migration-checker';

global.TeamOperations.requestJoin('deploy-v2-1-0', {
  agentId: 'migration-checker',
  agentName: 'Migration Checker',
  agentType: 'checker',
});

const tasks = global.TaskOperations.getTasks('deploy-v2-1-0', { status: 'pending' });
const migrationTask = tasks.find((t) => t.title.includes('Migration'));
global.TaskOperations.claimTask('deploy-v2-1-0', migrationTask.id);

console.log('Checking database migrations...');

try {
  // Check for pending migrations
  const fs = require('fs');
  const path = require('path');

  const migrationsDir = path.join(process.cwd(), 'db/migrations');
  const migrations = fs.readdirSync(migrationsDir);

  // Verify each migration has up and down
  const issues = [];
  migrations.forEach((file) => {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    if (!content.includes('exports.up') || !content.includes('exports.down')) {
      issues.push(`${file}: Missing up or down method`);
    }
  });

  if (issues.length === 0) {
    global.TaskOperations.updateTask('deploy-v2-1-0', migrationTask.id, {
      status: 'completed',
      result: 'passed',
      details: `${migrations.length} migrations verified - all reversible`,
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      `✓ Migrations safe: ${migrations.length} migrations, all reversible`
    );
  } else {
    global.TaskOperations.updateTask('deploy-v2-1-0', migrationTask.id, {
      status: 'completed',
      result: 'failed',
      details: issues.join(', '),
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.write(
      'deploy-v2-1-0',
      'deploy-leader',
      `✗ MIGRATION ISSUES: ${issues.join(', ')}`
    );
  }
} catch (error) {
  global.TaskOperations.updateTask('deploy-v2-1-0', migrationTask.id, {
    status: 'completed',
    result: 'error',
    error: error.message,
    completedAt: new Date().toISOString(),
  });
}
```

## Leader Go/No-Go Decision

```javascript
// Wait for all pre-flight checks to complete
function waitForPreflightChecks() {
  const allTasks = global.TaskOperations.getTasks('deploy-v2-1-0');
  const preflightTasks = allTasks.filter((t) => t.type === 'preflight');
  const completed = preflightTasks.filter((t) => t.status === 'completed');

  return completed.length === preflightTasks.length;
}

// Poll until all checks complete
const checkInterval = setInterval(() => {
  if (waitForPreflightChecks()) {
    clearInterval(checkInterval);
    makeGoNoGoDecision();
  } else {
    console.log('Waiting for pre-flight checks to complete...');
  }
}, 10000); // Check every 10 seconds

function makeGoNoGoDecision() {
  const allTasks = global.TaskOperations.getTasks('deploy-v2-1-0');
  const preflightTasks = allTasks.filter((t) => t.type === 'preflight');

  // Check if any critical checks failed
  const failed = preflightTasks.filter((t) => t.result === 'failed' || t.result === 'error');

  const criticalFailed = failed.filter((t) => t.priority === 'critical');

  if (criticalFailed.length > 0) {
    // ABORT DEPLOYMENT
    console.log('GO/NO-GO: NO-GO ✗');
    console.log(`Critical checks failed: ${criticalFailed.map((t) => t.title).join(', ')}`);

    global.TeamOperations.broadcast(
      'deploy-v2-1-0',
      `⛔ DEPLOYMENT ABORTED - Critical checks failed: ${criticalFailed.map((t) => t.title).join(', ')}`
    );

    // Clean up
    global.TeamOperations.cleanup('deploy-v2-1-0');
    return;
  }

  // All critical checks passed
  console.log('GO/NO-GO: GO ✓');
  console.log('All critical pre-flight checks passed');

  global.TeamOperations.broadcast(
    'deploy-v2-1-0',
    '✓ All pre-flight checks passed. Proceeding with deployment.'
  );

  // Create deployment task
  const deployTask = global.TaskOperations.createTask('deploy-v2-1-0', {
    title: 'Deploy to Production',
    description: 'Execute production deployment',
    priority: 'critical',
    type: 'deploy',
    command: 'npm run deploy:prod',
  });

  console.log('Created deployment task');
}
```

## Deployer Agent

```javascript
process.env.OPENCODE_AGENT_ID = 'deployer';

global.TeamOperations.requestJoin('deploy-v2-1-0', {
  agentId: 'deployer',
  agentName: 'Production Deployer',
  agentType: 'deployer',
});

// Wait for deploy task to be created
const deployTask = global.TaskOperations.getTasks('deploy-v2-1-0').find(
  (t) => t.type === 'deploy' && t.status === 'pending'
);

if (deployTask) {
  global.TaskOperations.claimTask('deploy-v2-1-0', deployTask.id);

  console.log('🚀 Starting production deployment...');

  global.TeamOperations.broadcast('deploy-v2-1-0', '🚀 Deployment in progress...');

  try {
    const { execSync } = require('child_process');
    const output = execSync('npm run deploy:prod', {
      encoding: 'utf-8',
      timeout: 30 * 60 * 1000, // 30 minute timeout
    });

    global.TaskOperations.updateTask('deploy-v2-1-0', deployTask.id, {
      status: 'completed',
      result: 'success',
      output: output,
      completedAt: new Date().toISOString(),
    });

    global.TeamOperations.broadcast(
      'deploy-v2-1-0',
      '✓ DEPLOYMENT SUCCESSFUL! Version 2.1.0 is now live.'
    );

    console.log('✓ Deployment successful!');
  } catch (error) {
    global.TaskOperations.updateTask('deploy-v2-1-0', deployTask.id, {
      status: 'failed',
      error: error.message,
      failedAt: new Date().toISOString(),
    });

    global.TeamOperations.broadcast(
      'deploy-v2-1-0',
      `✗ DEPLOYMENT FAILED: ${error.message}. Initiating rollback...`
    );

    // Trigger rollback
    // ... rollback logic ...
  }
}
```

## Key Benefits

1. **Parallel Verification**: All checks run simultaneously
2. **Gate Control**: Deployment only proceeds if all checks pass
3. **Clear Decision Point**: Explicit go/no-go decision
4. **Audit Trail**: All checks recorded with results
5. **Automated Rollback**: Can trigger on deployment failure
6. **Comprehensive**: Multiple aspects verified independently

## Typical Timeline

- Pre-flight checks (parallel): ~5-10 minutes
- Go/no-go decision: <1 minute
- Deployment: ~5-15 minutes
- Total: ~10-25 minutes (vs. serial ~30-45 minutes)

## Tips

1. **Mark critical checks clearly**: Use priority levels
2. **Set appropriate timeouts**: Some checks take time
3. **Provide detailed failure info**: Help diagnose issues
4. **Have rollback ready**: Prepare for deployment failures
5. **Monitor post-deployment**: Keep watching after deploy completes
