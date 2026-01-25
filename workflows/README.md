# Team Coordination Workflows

Reusable workflow templates for common multi-agent collaboration patterns.

## Available Workflows

### [code-review.md](./code-review.md)
Parallel code review across specialized reviewers (security, performance, quality).

**Roles**: 1 leader + 2-4 members  
**Duration**: 30-60 minutes  
**Use when**: You need comprehensive code review with specialist focus

## Using Workflows

### 1. Choose a Workflow
Select a workflow that matches your task pattern.

### 2. Configure Agent Roles
Assign agents with appropriate permissions (see `examples/opencode-config-example.json`):

```json
{
  "agent": {
    "team-leader": {...},
    "team-member": {...}
  }
}
```

### 3. Follow the Steps
Each workflow provides:
- Role definitions
- Step-by-step instructions
- Example commands
- Success criteria

### 4. Customize as Needed
Workflows are templates - adapt them:
- Add/remove review types
- Adjust team sizes
- Change priorities
- Modify communication patterns

## Creating Custom Workflows

### Template Structure

```markdown
---
name: workflow-name
description: What this workflow accomplishes
roles:
  - role-name (count)
tools_required:
  - tool-1
  - tool-2
duration: estimated-time
---

# Workflow Name

## Overview
What this workflow does

## Roles
Who does what

## Workflow Steps
Detailed steps with examples

## Expected Outcomes
What you should achieve

## Customization
How to adapt it

## Success Metrics
How to measure success
```

### Best Practices

1. **Clear Role Definition**: Specify who does what
2. **Explicit Steps**: Provide concrete examples
3. **Success Criteria**: Define what "done" looks like
4. **Customization Guidance**: Show how to adapt
5. **Expected Timing**: Help with planning

## Permission-Based Roles

Workflows rely on permission-based roles. See `agent/` directory for role definitions:

- **team-leader**: Creates teams, distributes work, synthesizes results
- **team-member**: Joins teams, claims tasks, executes work
- **task-manager**: Creates/manages tasks, tracks progress

Each role has specific tool permissions defined in their AGENT.md files.

## Integration with Skills

Workflows complement the `team-coordination` skill:

- **Skill**: Provides tool documentation and general guidance
- **Workflow**: Provides specific step-by-step patterns
- **Agent**: Provides role-specific permissions and responsibilities

Use together for best results:
1. Agent has permissions (what they CAN do)
2. Skill provides tool reference (what tools EXIST)
3. Workflow provides pattern (HOW to accomplish a goal)

## Example: Starting a Code Review

```bash
# 1. Configure opencode with team roles
cp examples/opencode-config-example.json .opencode/opencode.json

# 2. Leader agent starts workflow
opencode --agent team-leader "Start code review workflow for PR-456"

# 3. Member agents join and claim tasks
opencode --agent team-member "Join review-pr-456 as security specialist"
opencode --agent team-member "Join review-pr-456 as performance specialist"

# 4. Leader synthesizes results
# (Automatically picks up messages and completed tasks)
```

## Contributing Workflows

Have a useful workflow pattern? Contribute it!

1. Create workflow markdown file
2. Follow template structure
3. Include clear examples
4. Test with real agents
5. Submit PR

### Good Workflow Candidates

- Parallel testing (unit, integration, e2e)
- Documentation generation (API docs, README, guides)
- Deployment coordination (build, test, deploy, verify)
- Incident response (triage, investigation, resolution, postmortem)
- Feature development (planning, implementation, review, deployment)

## Support

- For tool documentation: See `skills/team-coordination/SKILL.md`
- For role definitions: See `agent/*/AGENT.md`
- For implementation: See `docs/` directory
- For examples: See `examples/` directory
