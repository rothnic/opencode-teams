# Code Review Team Example

This example demonstrates how to set up a team of specialized reviewers to conduct a thorough code review.

## Team Structure

- **Leader**: Coordinates the review and synthesizes feedback
- **Security Reviewer**: Focuses on security vulnerabilities
- **Performance Reviewer**: Checks for performance issues
- **Style Reviewer**: Ensures code style consistency
- **Logic Reviewer**: Verifies business logic correctness

## Setup

### 1. Leader Creates Team

```javascript
// Leader agent initialization
process.env.OPENCODE_TEAM_NAME = 'code-review-pr-789';
process.env.OPENCODE_AGENT_ID = 'review-leader';
process.env.OPENCODE_AGENT_NAME = 'Review Coordinator';
process.env.OPENCODE_AGENT_TYPE = 'leader';

// Create the team
const team = global.TeamOperations.spawnTeam('code-review-pr-789', {
  agentId: 'review-leader',
  agentName: 'Review Coordinator',
  agentType: 'leader',
});

console.log('Code review team created:', team.name);
```

### 2. Create Review Tasks

```javascript
// Define review aspects
const reviewAspects = [
  {
    title: 'Security Review',
    description: 'Check for security vulnerabilities, injection risks, auth issues',
    priority: 'critical',
    specialization: 'security',
  },
  {
    title: 'Performance Review',
    description: 'Check for performance issues, inefficient queries, optimization opportunities',
    priority: 'high',
    specialization: 'performance',
  },
  {
    title: 'Style Review',
    description: 'Check code style, consistency, readability',
    priority: 'normal',
    specialization: 'style',
  },
  {
    title: 'Logic Review',
    description: 'Verify business logic correctness, edge cases, error handling',
    priority: 'high',
    specialization: 'logic',
  },
];

// Create tasks
reviewAspects.forEach((aspect) => {
  const task = global.TaskOperations.createTask('code-review-pr-789', aspect);
  console.log(`Created task: ${task.title}`);
});
```

### 3. Announce to Team

```javascript
global.TeamOperations.broadcast(
  'code-review-pr-789',
  'Code review team is ready. Review tasks are available. Specialists should claim their respective areas.'
);
```

## Reviewer Workflows

### Security Reviewer

```javascript
// Join team
process.env.OPENCODE_AGENT_ID = 'security-reviewer';
process.env.OPENCODE_AGENT_NAME = 'Security Specialist';

global.TeamOperations.requestJoin('code-review-pr-789', {
  agentId: 'security-reviewer',
  agentName: 'Security Specialist',
  agentType: 'code-reviewer',
  specialization: 'security',
});

// Claim security task
const tasks = global.TaskOperations.getTasks('code-review-pr-789', { status: 'pending' });
const securityTask = tasks.find((t) => t.specialization === 'security');
global.TaskOperations.claimTask('code-review-pr-789', securityTask.id);

// Perform review (example findings)
const findings = [
  {
    file: 'src/api/auth.js',
    line: 45,
    severity: 'critical',
    issue: 'SQL injection vulnerability',
    description: 'User input not sanitized before database query',
    recommendation: 'Use parameterized queries',
  },
  {
    file: 'src/api/users.js',
    line: 123,
    severity: 'high',
    issue: 'Missing authorization check',
    description: 'Endpoint allows any authenticated user to modify any profile',
    recommendation: 'Add ownership check: user.id === profile.userId',
  },
];

// Report findings
global.TaskOperations.updateTask('code-review-pr-789', securityTask.id, {
  status: 'completed',
  findings: findings,
  summary: `Found ${findings.length} security issues (${findings.filter((f) => f.severity === 'critical').length} critical)`,
  recommendation: 'changes_requested',
});

// Notify leader
global.TeamOperations.write(
  'code-review-pr-789',
  'review-leader',
  'Security review complete. Found 2 security issues that must be addressed before merge.'
);
```

### Performance Reviewer

```javascript
// Join and claim performance task
process.env.OPENCODE_AGENT_ID = 'performance-reviewer';

global.TeamOperations.requestJoin('code-review-pr-789', {
  agentId: 'performance-reviewer',
  agentName: 'Performance Specialist',
  agentType: 'code-reviewer',
  specialization: 'performance',
});

const tasks = global.TaskOperations.getTasks('code-review-pr-789', { status: 'pending' });
const perfTask = tasks.find((t) => t.specialization === 'performance');
global.TaskOperations.claimTask('code-review-pr-789', perfTask.id);

// Review and report
const perfFindings = [
  {
    file: 'src/services/order-service.js',
    line: 89,
    severity: 'high',
    issue: 'N+1 query problem',
    description: 'Loading related data in a loop',
    recommendation: 'Use eager loading with include/join',
  },
];

global.TaskOperations.updateTask('code-review-pr-789', perfTask.id, {
  status: 'completed',
  findings: perfFindings,
  summary: 'Found 1 performance issue',
  recommendation: 'changes_requested',
});
```

### Style Reviewer

```javascript
process.env.OPENCODE_AGENT_ID = 'style-reviewer';

global.TeamOperations.requestJoin('code-review-pr-789', {
  agentId: 'style-reviewer',
  agentName: 'Style Specialist',
  agentType: 'code-reviewer',
  specialization: 'style',
});

const tasks = global.TaskOperations.getTasks('code-review-pr-789', { status: 'pending' });
const styleTask = tasks.find((t) => t.specialization === 'style');
global.TaskOperations.claimTask('code-review-pr-789', styleTask.id);

// Review for style issues
const styleFindings = [
  {
    file: 'src/utils/helpers.js',
    line: 12,
    severity: 'low',
    issue: 'Inconsistent naming',
    description: 'Using camelCase when project uses snake_case',
    recommendation: 'Rename getUserData to get_user_data',
  },
];

global.TaskOperations.updateTask('code-review-pr-789', styleTask.id, {
  status: 'completed',
  findings: styleFindings,
  summary: 'Minor style issues found',
  recommendation: 'approved_with_suggestions',
});
```

### Logic Reviewer

```javascript
process.env.OPENCODE_AGENT_ID = 'logic-reviewer';

global.TeamOperations.requestJoin('code-review-pr-789', {
  agentId: 'logic-reviewer',
  agentName: 'Logic Specialist',
  agentType: 'code-reviewer',
  specialization: 'logic',
});

const tasks = global.TaskOperations.getTasks('code-review-pr-789', { status: 'pending' });
const logicTask = tasks.find((t) => t.specialization === 'logic');
global.TaskOperations.claimTask('code-review-pr-789', logicTask.id);

// Review business logic
const logicFindings = [
  {
    file: 'src/services/payment-service.js',
    line: 156,
    severity: 'high',
    issue: 'Missing edge case handling',
    description: 'Does not handle refund amount exceeding original payment',
    recommendation: 'Add validation: if (refundAmount > payment.amount) throw error',
  },
];

global.TaskOperations.updateTask('code-review-pr-789', logicTask.id, {
  status: 'completed',
  findings: logicFindings,
  summary: 'Found 1 logic issue with edge case handling',
  recommendation: 'changes_requested',
});
```

## Leader Synthesis

### Monitor Progress

```javascript
// Check task completion status
const allTasks = global.TaskOperations.getTasks('code-review-pr-789');
const completed = allTasks.filter((t) => t.status === 'completed');
const pending = allTasks.filter((t) => t.status === 'pending');

console.log(`Review progress: ${completed.length}/${allTasks.length} complete`);

if (pending.length === 0) {
  console.log('All reviews complete!');
}
```

### Synthesize Results

```javascript
// Gather all findings
const completedReviews = global.TaskOperations.getTasks('code-review-pr-789', {
  status: 'completed',
});

const allFindings = completedReviews
  .flatMap((review) => review.findings || [])
  .sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
  });

// Generate summary
const summary = {
  totalFindings: allFindings.length,
  critical: allFindings.filter((f) => f.severity === 'critical').length,
  high: allFindings.filter((f) => f.severity === 'high').length,
  medium: allFindings.filter((f) => f.severity === 'medium').length,
  low: allFindings.filter((f) => f.severity === 'low').length,
  byCategory: {
    security: allFindings.filter((f) => f.issue.includes('security') || f.file.includes('auth'))
      .length,
    performance: allFindings.filter(
      (f) => f.issue.includes('performance') || f.issue.includes('query')
    ).length,
    style: allFindings.filter((f) => f.severity === 'low').length,
    logic: allFindings.filter((f) => f.issue.includes('logic') || f.issue.includes('edge')).length,
  },
};

console.log('Review Summary:', summary);

// Determine overall recommendation
let recommendation;
if (summary.critical > 0) {
  recommendation = 'CHANGES REQUIRED - Critical issues found';
} else if (summary.high > 0) {
  recommendation = 'CHANGES RECOMMENDED - High priority issues found';
} else if (summary.medium > 0) {
  recommendation = 'APPROVED WITH SUGGESTIONS';
} else {
  recommendation = 'APPROVED';
}

// Broadcast final result
global.TeamOperations.broadcast(
  'code-review-pr-789',
  `Code review complete. ${recommendation}. Found ${allFindings.length} total issues.`
);
```

### Clean Up

```javascript
// Clean up team resources
global.TeamOperations.cleanup('code-review-pr-789');
console.log('Team resources cleaned up');
```

## Expected Output

The review process produces:

1. **Individual Review Reports**: Each specialist provides detailed findings in their area
2. **Consolidated Findings**: All issues sorted by severity
3. **Summary Statistics**: Counts by severity and category
4. **Overall Recommendation**: Approve, request changes, or block
5. **Actionable Feedback**: Specific file/line references with recommendations

## Benefits

1. **Parallel Review**: All aspects reviewed simultaneously
2. **Specialized Expertise**: Each reviewer focuses on their strength
3. **Comprehensive Coverage**: Multiple perspectives catch more issues
4. **Faster Turnaround**: Distributed work completes faster
5. **Consistent Quality**: Systematic approach ensures thoroughness
6. **Clear Communication**: Structured findings and recommendations
