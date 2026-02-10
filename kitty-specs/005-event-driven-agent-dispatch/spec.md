# Feature Specification: Event-Driven Agent Dispatch

**Feature Branch**: 005-event-driven-agent-dispatch
**Created**: 2026-02-10
**Status**: Draft
**Mission**: software-dev

## Overview

This feature adds an event-driven dispatch system to the OpenCode Teams plugin, enabling automatic agent actions in response to system events. Instead of relying solely on manual tool calls to spawn and direct agents, the system evaluates configurable rules against incoming events (task state changes, agent idle detection, session lifecycle) and dispatches agents or actions automatically. This brings proactive coordination to teams - agents respond to conditions rather than waiting for explicit commands.

## Requirements

### Functional Requirements

1. **Event Bus**: Implement a central event bus that collects events from the plugin's existing hook points (session.created, session.deleted, session.idle, tool.execute.after) and internal state changes (task completed, task unblocked, agent idle, agent terminated). The bus provides a subscribe/publish interface for decoupled event handling.

2. **Event Types**: Define a typed event taxonomy covering:
   - `task.completed` - a task transitions to completed status
   - `task.unblocked` - a task's dependencies are all satisfied, making it claimable
   - `agent.idle` - an agent's heartbeat source reports sdk_session_idle
   - `agent.terminated` - an agent has been terminated (graceful or forced)
   - `team.created` - a new team is spawned
   - `session.idle` - the OpenCode session has gone idle

3. **Dispatch Rules**: Support user-configurable event-condition-action (ECA) rules. Each rule specifies:
   - A trigger event type
   - An optional condition (e.g., "unblocked task count > 3", "team has fewer than 2 active workers")
   - An action to execute (e.g., "send message to leader", "auto-claim next pending task for idle agent", "log a warning")

4. **Auto-Dispatch on Task Unblock**: When a task's last blocking dependency completes, emit a `task.unblocked` event. If configured, automatically assign the unblocked task to an idle agent on the same team, or notify the leader that work is available.

5. **Idle Agent Reassignment**: When an agent becomes idle and unblocked tasks exist in the same team's queue, automatically suggest or assign the next highest-priority pending task to the idle agent.

6. **Dispatch Rule Storage**: Persist dispatch rules as part of the team configuration (extending TeamConfig) so rules survive across sessions and are scoped per team.

7. **Dispatch Tooling**: Expose tools for agents to manage dispatch rules at runtime:
   - `add-dispatch-rule` - register a new ECA rule for a team
   - `remove-dispatch-rule` - remove a rule by ID
   - `list-dispatch-rules` - view all active rules for a team
   - `get-dispatch-log` - retrieve recent dispatch actions taken

8. **Dispatch Logging**: Record every dispatch action (event matched, condition evaluated, action taken) in a per-team log for auditability and debugging.

### Non-Functional Requirements

- Event bus publish-subscribe cycle must complete within 50ms for in-process events
- Dispatch rule evaluation must add no more than 100ms latency to event processing
- The system must handle at least 100 events per second without dropping events
- Dispatch rules must be validated at creation time (invalid rules rejected with clear error)
- The dispatch log must retain at least the last 500 entries per team

## User Stories

### Priority 1: Automatic Task Handoff on Completion

As a team leader, I want completed tasks to automatically unblock dependent tasks and notify or assign idle agents, so that work flows continuously without me manually checking dependency chains and reassigning agents.

**Acceptance Scenarios**:

1. **Given** Task B depends on Task A, **When** Task A is marked completed, **Then** a `task.unblocked` event is emitted for Task B within 5 seconds.
2. **Given** an idle agent exists and Task B was just unblocked, **When** a dispatch rule matching `task.unblocked` is configured with auto-assign action, **Then** Task B is assigned to the idle agent and a notification is sent to the leader.
3. **Given** no idle agents exist when Task B unblocks, **When** the dispatch rule fires, **Then** the leader receives a message that Task B is available but no agent could be assigned.

---

### Priority 2: Idle Agent Work Assignment

As a team leader, I want idle agents to automatically pick up the next available task instead of sitting unused, so that team throughput is maximized without manual intervention.

**Acceptance Scenarios**:

1. **Given** Agent X becomes idle and 3 pending unblocked tasks exist, **When** the idle dispatch rule is configured, **Then** the highest-priority unblocked task is assigned to Agent X.
2. **Given** Agent X becomes idle and no pending tasks exist, **When** the idle dispatch rule fires, **Then** no action is taken and no error occurs.
3. **Given** two agents become idle simultaneously, **When** both trigger idle dispatch, **Then** each is assigned a different task (no double-assignment).

---

### Priority 3: Rule Management at Runtime

As a team leader, I want to add, remove, and list dispatch rules while the team is running, so that I can adjust automation behavior without restarting the team or editing config files.

**Acceptance Scenarios**:

1. **Given** I add a dispatch rule via the `add-dispatch-rule` tool, **When** the matching event occurs, **Then** the rule fires correctly.
2. **Given** I remove a dispatch rule, **When** the matching event occurs afterward, **Then** the rule no longer fires.
3. **Given** I list dispatch rules, **Then** all active rules for the team are returned with their configuration.

---

### Edge Cases

- What happens when a dispatch rule's action fails (e.g., agent spawn fails)? The failure is logged, the event is not retried, and the leader is notified.
- What happens when multiple rules match the same event? All matching rules fire in priority order. If two rules conflict (e.g., both try to assign the same task), the first rule wins and subsequent rules see updated state.
- What happens when a rule references a nonexistent team or agent? The rule is validated at creation; runtime mismatches are logged as errors without crashing.
- What happens during high event volume? The event bus processes events sequentially per team to prevent race conditions. Cross-team events are independent.
- How does the dispatch log handle overflow? Oldest entries are evicted when the log exceeds 500 entries (ring buffer behavior).

## Key Entities

### DispatchEvent

A typed occurrence in the system containing:

- Event Type: One of the defined event taxonomy values
- Team Name: The team context where the event occurred
- Timestamp: When the event was emitted
- Payload: Event-specific data (task ID, agent ID, etc.)

### DispatchRule

A configurable event-condition-action definition containing:

- ID: Unique identifier for the rule
- Event Type: Which event triggers evaluation
- Condition: Optional predicate to filter events (e.g., check task count, agent count)
- Action: What to do when triggered (notify leader, auto-assign task, log warning)
- Priority: Ordering when multiple rules match the same event
- Enabled: Whether the rule is currently active

### DispatchLog

An audit record containing:

- Rule ID: Which rule was triggered
- Event: The triggering event details
- Condition Result: Whether the condition passed
- Action Taken: What action was executed
- Outcome: Success or failure with details
- Timestamp: When the dispatch occurred

## Success Criteria

### Measurable Outcomes

- Unblocked tasks are detected and events emitted within 5 seconds of dependency completion
- Idle agents receive task assignments within 10 seconds of becoming idle (when rules configured)
- Dispatch rules can be added and take effect within the same session without restart
- 100% of dispatch actions are logged with full audit trail
- No task double-assignments occur under concurrent dispatch conditions

### Quality Metrics

- Zero event drops under normal operating conditions (< 100 events/second)
- Rule validation catches 100% of syntactically invalid rules at creation time
- Dispatch log retrieval returns results within 200ms for the last 100 entries

## Dependencies

- Feature 001 (Robust Coordination Core): Required for task dependency tracking and atomic state management
- Feature 004 (Team Topologies and Roles): Required for role-based permission checking on dispatch actions
- Existing agent lifecycle and heartbeat infrastructure (agent.ts, workflow-monitor.ts)

## Assumptions

- The event bus operates in-process (same Bun runtime as the plugin); no external message broker needed
- Dispatch rules are scoped per team, not global
- Auto-assignment respects existing role permissions (e.g., reviewers are not auto-assigned implementation tasks)
- The existing WorkflowMonitor pattern provides a foundation that can be extended rather than replaced
