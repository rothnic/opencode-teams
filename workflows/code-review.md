---
name: code-review
description: Coordinate parallel code reviews across specialized reviewers
roles:
  - team-leader (1)
  - team-member (2-4)
tools_required:
  - spawn-team
  - create-task
  - join-team
  - claim-task
  - send-message
duration: 30-60 minutes
---

# Code Review Workflow

Parallel code review workflow using specialized reviewer agents.

## Overview

This workflow distributes code review across multiple specialist agents working in parallel, then synthesizes their findings into a comprehensive review.

## Roles

### Leader (1 agent)

- Creates review team
- Breaks review into specialized tasks
- Coordinates reviewers
- Synthesizes final review

### Members (2-4 agents)

- Join as specialists (security, performance, style, logic)
- Claim relevant tasks
- Perform focused reviews
- Report findings

## Workflow Steps

### Phase 1: Setup (Leader)

```
1. spawn-team("review-pr-{number}")
2. create-task("review-pr-{number}", {
     title: "Security Review",
     description: "Check for vulnerabilities, auth issues, input validation",
     priority: "high"
   })
3. create-task("review-pr-{number}", {
     title: "Performance Review",
     description: "Analyze queries, caching, algorithm complexity",
     priority: "medium"
   })
4. create-task("review-pr-{number}", {
     title: "Code Quality Review",
     description: "Check style, patterns, maintainability",
     priority: "normal"
   })
5. broadcast-message("review-pr-{number}",
     "Review team: Please claim tasks matching your expertise")
```

### Phase 2: Parallel Review (Members)

```
Each specialist agent:
1. discover-teams()
2. join-team("review-pr-{number}", {agentType: "{specialty}-reviewer"})
3. read-messages("review-pr-{number}")
4. get-tasks("review-pr-{number}", {status: "pending"})
5. claim-task("review-pr-{number}", "{task-id}")
6. // Perform specialized review
7. update-task("review-pr-{number}", "{task-id}", {
     status: "completed",
     description: "Findings: ..."
   })
8. send-message("review-pr-{number}", "{leader-id}",
     "Review complete. See task for details.")
```

### Phase 3: Synthesis (Leader)

```
1. get-tasks("review-pr-{number}", {status: "completed"})
2. read-messages("review-pr-{number}")
3. // Synthesize all findings
4. // Create comprehensive review document
5. broadcast-message("review-pr-{number}", "Review complete. Thanks team!")
```

## Expected Outcomes

- Security issues identified
- Performance concerns documented
- Code quality feedback provided
- Comprehensive review document
- Parallel execution (faster than sequential)

## Customization

### Add More Review Types

- Architecture review
- Documentation review
- Test coverage review
- Accessibility review

### Adjust Team Size

- Small PRs: 2 reviewers (security + quality)
- Medium PRs: 3 reviewers (security + performance + quality)
- Large PRs: 4+ reviewers (add architecture, testing)

### Priority Tuning

- Critical PRs: All tasks "high" priority
- Feature PRs: Mixed priorities
- Refactoring PRs: Focus on quality and testing

## Success Metrics

- Review completed in < 1 hour
- All critical issues found
- Each specialist contributes
- No redundant work
- Clear, actionable feedback

## Example Output

```
# PR Review Summary

## Security (High Priority) ✓
- Found: SQL injection risk in user search
- Action: Use parameterized queries
- Status: Critical - must fix

## Performance (Medium Priority) ✓
- Found: N+1 query in comment loading
- Action: Add eager loading
- Status: Important - should fix

## Code Quality (Normal Priority) ✓
- Found: Nested conditionals in handler
- Action: Extract methods for clarity
- Status: Nice to have - refactor later

## Overall Recommendation
Request changes - address security issue before merge.
```

## Tips

- Create tasks before announcing to team
- Set realistic completion timeframes
- Specialists should focus on their domain
- Leader synthesizes, doesn't duplicate review
- Use task descriptions for detailed findings
