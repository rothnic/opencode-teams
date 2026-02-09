# OpenCode Teams Plugin - Research Documentation

## Overview

This document contains research findings on Claude Code's TeammateTool feature
and how to implement it as an OpenCode plugin.

## Source Material

Based on analysis from: <https://gist.github.com/kieranklaassen/d2b35569be2c7f1412c64861a219d51f>

## Claude Code TeammateTool Analysis

### Discovery Method

The TeammateTool feature was discovered through binary analysis of Claude Code v2.1.19:

```bash
strings ~/.local/share/claude/versions/2.1.19 | grep -i "TeammateTool"
```

### Core Operations

TeammateTool provides 13 operations for multi-agent coordination:

| Operation         | Purpose                           | Use Case                      |
| ----------------- | --------------------------------- | ----------------------------- |
| `spawnTeam`       | Create a new team, become leader  | Initialize a multi-agent team |
| `discoverTeams`   | List available teams to join      | Find existing active teams    |
| `requestJoin`     | Ask to join an existing team      | Agent joining coordination    |
| `approveJoin`     | Leader accepts a join request     | Team member management        |
| `rejectJoin`      | Leader declines a join request    | Team access control           |
| `write`           | Send message to specific teammate | Direct agent communication    |
| `broadcast`       | Send message to all teammates     | Team-wide announcements       |
| `requestShutdown` | Ask a teammate to shut down       | Graceful agent termination    |
| `approveShutdown` | Accept shutdown and exit          | Confirm completion            |
| `rejectShutdown`  | Decline shutdown, keep working    | Signal incomplete work        |
| `approvePlan`     | Leader approves teammate's plan   | Workflow gate control         |
| `rejectPlan`      | Leader rejects plan with feedback | Quality control               |
| `cleanup`         | Remove team directories           | Resource cleanup              |

### Environment Variables

TeammateTool uses environment variables for context:

| Variable                         | Purpose                         |
| -------------------------------- | ------------------------------- |
| `CLAUDE_CODE_TEAM_NAME`          | Current team context identifier |
| `CLAUDE_CODE_AGENT_ID`           | Unique agent identifier         |
| `CLAUDE_CODE_AGENT_NAME`         | Human-readable agent name       |
| `CLAUDE_CODE_AGENT_TYPE`         | Agent role/specialization       |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | Whether plan approval needed    |

### File Structure

TeammateTool uses a file-based coordination system:

```text
~/.claude/
├── teams/
│   └── {team-name}/
│       ├── config.json          # Team metadata, member list
│       └── messages/            # Inter-agent mailbox
│           └── {session-id}/
├── tasks/
│   └── {team-name}/             # Team-scoped task queue
│       ├── 1.json
│       └── ...
```

### Spawn Backends

Three backend options for spawning agents:

1. **iTerm2 split panes**: Native macOS, visual side-by-side
2. **tmux windows**: Cross-platform, server/headless
3. **In-process**: Same process, fastest coordination

### Feature Gating

Currently gated behind feature flags in Claude Code:

```javascript
isEnabled() {
  return I9() && qFB()  // Two feature flags must be true
}
```

## Common Patterns

### 1. The Leader Pattern

- One orchestrator agent
- Multiple specialist agents
- Leader synthesizes results
- Most common pattern

### 2. The Swarm Pattern

- Leader creates task queue
- Workers self-assign tasks
- Ideal for parallel work
- Workers are interchangeable

### 3. The Pipeline Pattern

- Sequential processing
- Each agent waits for predecessor
- Handoffs between stages
- Dependency tracking via `blockedBy`

### 4. The Council Pattern

- Multiple agents tackle same problem
- Diverse perspectives
- Leader picks best solution
- Used for critical decisions

### 5. The Watchdog Pattern

- Worker performs task
- Watcher monitors progress
- Can trigger rollback
- Safety for critical operations

## Use Cases

### Code Review Swarm

- Parallel analysis by multiple reviewers
- Each focuses on different aspects (security, style, logic, performance)
- Leader synthesizes feedback

### Feature Development Team

- Decompose large features
- Distribute work automatically
- Continuous integration
- Coordination via shared task queue

### Self-Organizing Refactor

- Scout discovers work items
- Workers claim from task queue
- Verifier runs tests
- Abandoned tasks auto-reassigned

### Research Council

- Multiple perspectives on technical decisions
- Debate phase with cross-agent communication
- Cost/benefit analysis
- Synthesized recommendation

### Deployment Guardian

- Parallel pre-flight checks
- Gate control (all must pass)
- Deploy with monitoring
- Automatic rollback on failure

### Living Documentation

- Detect API changes
- Update multiple doc types in parallel
- Review and feedback loop
- Keep docs in sync automatically

### Infinite Context Window

- Domain specialists per codebase area
- Persistent context for each domain
- Query routing to relevant experts
- Combined knowledge spans entire codebase

## Failure Handling

| Failure Mode            | System Response                          |
| ----------------------- | ---------------------------------------- |
| Agent crashes mid-task  | Heartbeat timeout (5min) releases task   |
| Leader crashes          | Workers complete current work, then idle |
| Infinite loop           | requestShutdown → timeout → force kill   |
| Deadlocked dependencies | Cycle detection at task creation         |
| Agent refuses shutdown  | Timeout → forced termination             |
| Resource exhaustion     | Max agents per team limit                |

## OpenCode Plugin Integration

### Plugin Structure

OpenCode supports plugins through:

- Project-level: `.opencode/plugins/`
- Global: `~/.config/opencode/plugins/`
- npm packages referenced in `opencode.json`

### Skills System

Skills are defined in markdown with YAML frontmatter:

- Location: `.opencode/skills/{name}/SKILL.md`
- Global: `~/.config/opencode/skills/{name}/SKILL.md`
- Claude-compatible: `.claude/skills/`

### Agent System

Agents are personalities/workflows in markdown:

- Location: `.opencode/agent/{name}/AGENT.md`
- Configuration and behavior definition
- Can be customized globally or per project

### Hooks Available

Key hooks for team coordination:

- `tool.execute.before` - Intercept tool calls
- `tool.execute.after` - React to tool results
- `session.created` - New agent session
- `session.idle` - Agent waiting for input
- `session.deleted` - Agent cleanup

### Implementation Strategy

1. **Core Plugin** (`plugin/index.ts`)
   - Register team coordination tools
   - Implement file-based messaging
   - Handle team lifecycle

2. **Skills**
   - `spawn-team`: Create and manage teams
   - `team-comm`: Inter-agent messaging
   - `task-queue`: Shared work distribution

3. **Agents**
   - `team-leader`: Orchestration role
   - `team-worker`: Generic worker role
   - `team-specialist`: Domain-specific roles

4. **Example Teams**
   - Code review team
   - Refactoring team
   - Testing team
   - Documentation team

## Key Differences from Claude Code

### Adaptations Needed

1. **No feature flags**: OpenCode plugins are opt-in by installation
2. **Different spawn mechanisms**: Use OpenCode's session management
3. **File locations**: Use OpenCode conventions (`.opencode/` instead of `.claude/`)
4. **Environment variables**: Prefix with `OPENCODE_` instead of `CLAUDE_CODE_`

### Advantages in OpenCode

1. **Open ecosystem**: Share and improve collaboratively
2. **Transparent implementation**: No binary analysis needed
3. **Flexible configuration**: User-controlled without feature flags
4. **Cross-platform**: Works wherever OpenCode works

## Implementation Checklist

- [x] Research TeammateTool features
- [x] Map to OpenCode plugin system
- [ ] Create plugin directory structure
- [ ] Implement core coordination logic
- [ ] Create skills for team operations
- [ ] Create agent templates
- [ ] Build example teams
- [ ] Write comprehensive documentation
- [ ] Test with real use cases

## References

- Claude Code TeammateTool Analysis: <https://gist.github.com/kieranklaassen/d2b35569be2c7f1412c64861a219d51f>
- OpenCode Plugins: <https://opencode.ai/docs/plugins/>
- OpenCode Skills: <https://opencode.ai/docs/skills>
- OpenCode Config: <https://opencode.ai/docs/config/>
