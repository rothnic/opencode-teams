# Feature Specification: Beads Integration

**Feature Branch**: 006-beads-integration
**Created**: 2026-02-10
**Status**: Draft (OPTIONAL)
**Mission**: software-dev

## Overview

This feature enables seamless integration between team coordination and beads issue tracking system, allowing team tasks to persist across sessions and providing visual oversight through beads viewer. The integration ensures that multi-agent work survives session boundaries while maintaining synchronization between team task states and beads issue states.

## User Stories

### P1: Session Persistence and Recovery

As a team leader, I want tasks created in a team session to automatically persist as beads issues so that when the session ends and a new one starts, the tasks are recovered with full context, allowing agents to continue work seamlessly.

**Acceptance Scenarios**:

1. **Given** a team session with active tasks and beads integration enabled, **When** the session ends, **Then** all task states are persisted as beads issues with full metadata.
2. **Given** a previous session's tasks exist as beads issues, **When** a new session starts, **Then** all task states and agent assignments are restored from beads data.

---

### P2: Visual Dashboard Oversight

As a project manager, I want to open a visual dashboard showing team task progress, agent assignments, and message history across all sessions so that I can monitor multi-agent coordination without needing to interact directly with the agents.

**Acceptance Scenarios**:

1. **Given** an active team with beads integration, **When** the user opens the beads viewer, **Then** task progress, agent assignments, and recent messages are displayed accurately.
2. **Given** multiple past sessions, **When** the user views historical data, **Then** cross-session task history is presented chronologically.

---

### P3: Agent Continuity Across Sessions

As an agent in a new session, I want to read beads state to understand what a previous agent accomplished so that I can continue the work from where it left off, maintaining continuity in complex tasks.

**Acceptance Scenarios**:

1. **Given** beads issues from a prior session, **When** a new agent queries beads state, **Then** the agent receives task history, previous agent notes, and remaining work items.
2. **Given** a task was partially completed in a prior session, **When** recovered in a new session, **Then** the task retains its in_progress status and previous assignee context.

---

### P4: Epic-Level Progress Tracking

As a project manager, I want a team's work to be tracked at the epic level in beads so that I have visibility into multi-agent coordination progress at a high level.

**Acceptance Scenarios**:

1. **Given** a team with multiple tasks linked to beads, **When** the user views the epic, **Then** aggregate progress reflects actual task completion percentage.
2. **Given** all tasks in a team are completed, **When** the epic is checked, **Then** the epic shows 100% completion.

---

### Edge Cases

- What happens when beads is not initialized in the project (.beads directory missing)?
- How does the system handle sync when a beads issue is manually deleted outside the team system?
- What happens when session recovery finds conflicting agent assignments from multiple prior sessions?
- How does sync behave during git branch switching or worktree operations?
- What happens when the beads CLI is unavailable or returns errors during sync?
- How does the system handle stale beads data from a session that ended weeks ago?

## Requirements

### Functional Requirements

1. **Team Task to Beads Issue Synchronization**
   - Team tasks can be linked to persistent beads issues
   - Synchronization direction can be configured (one-way or bidirectional)
   - Links survive across session restarts

2. **Automatic Beads Issue Creation**
   - Option to create beads issue when team task is created
   - Issue metadata includes team context and task details
   - Creation can be enabled/disabled per team or task type

3. **Status Synchronization**
   - Team task status changes (pending/in_progress/completed) update linked beads issue status
   - Beads issue status changes update linked team task status
   - Synchronization handles conflicts gracefully

4. **Dependency Mapping**
   - Team task dependencies (blocks/blocked_by) map to beads dependency relationships
   - Dependency changes in one system reflect in the other
   - Circular dependency prevention

5. **Session Context Recovery**
   - New sessions can recover in-progress team work from beads state
   - Agent assignments and task states restored from beads data
   - Message history and team configuration recovered

6. **Beads Viewer Integration**
   - Team coordination state exposed through beads viewer interface
   - Real-time display of tasks, messages, and agent status
   - Historical view across multiple sessions

7. **Epic-Level Coordination**
   - Team-level work maps to beads epics
   - Epic progress reflects aggregate team task completion
   - Epic creation and management through team operations

8. **Cross-Session Agent Continuity**
   - Agents can read beads history to understand previous work
   - Context transfer between agents across sessions
   - Work handoff documentation in beads

### Non-Functional Requirements

- Synchronization operations complete within acceptable time limits
- Data consistency maintained across systems
- Error handling for synchronization failures
- Performance impact minimized on team operations

## Key Entities

### TaskBeadLink

Represents the linkage between a team task and a beads issue.

- team_task_id: Unique identifier for the team task
- beads_issue_id: Unique identifier for the beads issue
- sync_direction: Direction of synchronization (one-way or bidirectional)
- last_synced_timestamp: Timestamp of last synchronization operation

### BeadsEpicMapping

Maps team-level work to beads epics for high-level tracking.

- team_name: Name of the team
- epic_id: Unique identifier for the beads epic
- created_timestamp: When the mapping was established
- last_updated_timestamp: When the mapping was last updated

### SessionRecoveryState

Captures state needed to recover team work across sessions.

- team_config_snapshot: Snapshot of team configuration at session end
- task_states: Current state of all team tasks
- agent_assignments: Mapping of agents to tasks
- message_history_summary: Summary of key messages from the session

## Success Criteria

### Quantitative Metrics

- 100% of team tasks with beads integration enabled successfully create corresponding beads issues
- Synchronization latency between team task and beads issue status changes is under 5 seconds
- Session recovery restores 100% of active task states and agent assignments
- Epic progress accuracy matches team task completion rates within 1%

### Qualitative Measures

- Users can seamlessly continue work across session boundaries without manual intervention
- Visual dashboard provides clear, real-time view of team coordination state
- Agents demonstrate continuity by referencing previous session work in beads
- Project managers gain visibility into multi-agent progress through epic tracking

## Dependencies

- Feature 001 (data layer) for robust task storage and retrieval
- Beads issue tracking system availability
- Team coordination primitives (teams, tasks, messaging)

## Acceptance Criteria

- All user stories can be executed end-to-end without errors
- Synchronization works bidirectionally between team tasks and beads issues
- Session recovery mechanism successfully restores team state
- Beads viewer displays accurate team coordination information
- Epic-level tracking reflects true team progress
- Cross-session agent continuity is demonstrated through beads history
- No data loss occurs during synchronization operations
- Performance benchmarks meet or exceed requirements
