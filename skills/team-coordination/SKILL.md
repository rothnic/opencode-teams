---
name: team-coordination
description: Coordinate work across multiple AI agents using teams, tasks, and messaging
author: opencode-teams
version: 1.0.0
compatibility: opencode
metadata:
  category: collaboration
  audience: ai-agents
---

# Team Coordination Skill

Coordinate multi-agent workflows using teams, shared task queues, and inter-agent messaging.

## What This Skill Does

- Create and manage teams of AI agents
- Distribute work via shared task queues
- Enable communication between team members
- Track task ownership and completion

## When to Use This Skill

Use this skill when:

- You need multiple agents to work on a complex task together
- Work can be parallelized across specialist agents
- Agents need to communicate findings or coordinate actions
- You want to track who is working on what

## Available Tools

This skill uses the following OpenCode tools (registered by opencode-teams plugin):

### Team Management

- **spawn-team**: Create a new team. Accepts optional `templateName` and
  `description` parameters.
- **discover-teams**: List available teams to join
- **join-team**: Join an existing team as a member
- **get-team-info**: Get details about team members
- **delete-team**: Delete a team and all its resources (tasks, inboxes, config)

### Task Coordination

- **create-task**: Add a task to the team's queue
- **get-tasks**: View available or assigned tasks
- **claim-task**: Claim a pending task. In hierarchical topology,
  only leader/task-manager can assign.
- **update-task**: Update task status or details

### Communication

- **send-message**: Send a direct message to a teammate
- **broadcast-message**: Send a message to all team members
- **read-messages**: Check messages from teammates

### Templates

- **save-template**: Save a team template for reuse (topology, roles, default tasks)
- **list-templates**: List all available team templates (project-local and global)
- **delete-template**: Delete a project-local team template

### Permissions

- **check-permission**: Check if a role is allowed to use a specific tool

## Example Workflows

### Code Review Team

```text
Leader Agent:
1. Use spawn-team with templateName="code-review" to create "review-pr-456"
   (auto-creates Security Review, Performance Review, Style Review tasks)

Specialist Agents:
1. Use discover-teams to find "review-pr-456"
2. Use join-team to join as a member
3. Use get-tasks with filter {status: "pending"}
4. Use claim-task for their specialty
5. Complete review work
6. Use update-task to mark completed
7. Use send-message to report findings to leader

Leader Agent:
1. Use read-messages to collect all findings
2. Synthesize final review
3. Use delete-team when done
```

### Hierarchical Team with Template

```text
Leader Agent:
1. Use spawn-team with templateName="leader-workers" to create "build-features"
   (creates hierarchical topology - workers cannot self-assign tasks)
2. Use create-task to add work items
3. Assign tasks to workers by claiming on their behalf

Workers:
1. Use join-team to join
2. Wait for task assignment via poll-inbox
3. Work on assigned task
4. Use update-task to mark completed
```

### Parallel Refactoring

```text
Leader Agent:
1. Use spawn-team to create "refactor-services"
2. Break down work into service-specific tasks
3. Use create-task for each service

Worker Agents:
1. Use discover-teams to find work
2. Use join-team to join
3. Use get-tasks to see available work
4. Use claim-task for a service
5. Perform refactoring
6. Use broadcast-message to announce completion
```

## Environment Variables

OpenCode sets these automatically:

- `OPENCODE_TEAM_NAME`: Current team context
- `OPENCODE_AGENT_ID`: Your unique agent identifier
- `OPENCODE_AGENT_NAME`: Your display name
- `OPENCODE_AGENT_TYPE`: Your role (leader, worker, specialist, etc.)

## Best Practices

**For Leaders:**

- Create specific, well-scoped tasks
- Set appropriate task priorities
- Monitor team progress via get-tasks
- Synthesize results from multiple agents

**For Workers:**

- Claim tasks that match your capabilities
- Update task status regularly
- Communicate blockers or questions
- Share findings with relevant teammates

**For Everyone:**

- Use descriptive team names (e.g., "review-pr-123" not "team1")
- Keep messages concise and actionable
- Clean up teams when work is complete (leader responsibility)

## Error Handling

All tools throw descriptive errors:

- Team already exists (when creating)
- Team does not exist (when joining)
- Task already claimed (when claiming)
- Invalid team/task names

Check error messages and adjust accordingly.

## Related Skills

This skill works well with:

- Code analysis skills (for reviewing code)
- Testing skills (for test coverage tasks)
- Documentation skills (for doc generation tasks)

## Tips

- Start small: Create a team with 2-3 agents first
- Use clear task descriptions
- Establish communication patterns early
- Leaders should periodically check task status
- Workers should broadcast when they complete major milestones
