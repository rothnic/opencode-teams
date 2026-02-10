# Feature Specification: Event-Driven Agent Dispatch

**Feature Branch**: 005-event-driven-agent-dispatch
**Created**: 2026-02-10
**Status**: Draft
**Mission**: software-dev

## Overview

Event-Driven Agent Dispatch enables automated coordination and response to platform events through configurable rules. The system monitors OpenCode platform events (session lifecycle, tool execution, file changes, idle detection) and triggers agent actions based on user-defined event-condition-action rules. This feature automates workflow transitions, task unblocking notifications, and team coordination without manual intervention.

## User Stories

### P1: Task Dependency Completion Notification

As a team leader, I want the system to automatically notify the next agent when their blocked task becomes ready for work after all dependencies complete, so that work can proceed without manual status checking.

**Acceptance Scenarios**:

1. **Given** a task is blocked by two dependencies, **When** both dependencies are completed, **Then** the assigned agent is notified within 5 seconds that the task is ready for work.
2. **Given** a task has no assigned agent when unblocked, **When** dependencies complete, **Then** the team leader is notified that an unassigned task is ready.

---

### P2: File Change Triggered Actions

As a developer, I want to configure rules like "when test files change, notify the test-runner agent to re-run the test suite" so that automated workflows respond to code changes without manual triggers.

**Acceptance Scenarios**:

1. **Given** a rule matching file changes in "tests/**", **When** a test file is edited, **Then\*\* the configured action (notify test-runner agent) fires within the rule evaluation window.
2. **Given** a file change event that does not match any rule, **When** the event is processed, **Then** no action is triggered but the event is logged.

---

### P3: Idle Agent Management

As a team coordinator, I want the system to mark agents inactive after 5 minutes of idle time and send a message to the team leader asking whether to reassign tasks, so that blocked work can be redistributed efficiently.

**Acceptance Scenarios**:

1. **Given** an agent has been idle beyond the configured threshold, **When** idle detection fires, **Then** the agent is marked inactive and the leader is notified with the agent's current task list.
2. **Given** an agent becomes active again before the threshold, **When** idle detection evaluates, **Then** no action is taken and the agent remains active.

---

### P4: Event Audit Trail

As a user, I want to review an audit log showing all event-triggered actions that occurred during a team's work session, so that I can understand automated behavior and debug rule configurations.

**Acceptance Scenarios**:

1. **Given** multiple event rules have fired during a session, **When** the user queries the event log, **Then** all events, matched rules, and action outcomes are listed chronologically.
2. **Given** a rule action failed, **When** the user reviews the log, **Then** the failure reason and any retry attempts are recorded.

---

### Edge Cases

- What happens when an event rule's target agent is offline or dead?
- How does the system handle recursive event triggering (action triggers another event matching a rule)?
- What happens when multiple rules match the same event with conflicting actions?
- How does the system behave when the event log storage is full?
- What happens when a rule's condition expression is syntactically invalid?
- How does the system handle events arriving during system startup before rules are loaded?

## Key Entities

### EventRule

Represents a configurable rule that matches events to conditions and triggers actions.

- event_type: The type of platform event to monitor (e.g., session.created, file.edited, tool.execute.after)
- condition_expression: Optional expression that must evaluate true for the rule to trigger
- action_type: The type of action to take (e.g., notify_agent, spawn_agent, update_task_status)
- target_agent: The agent or team to target with the action
- target_team: Optional team context for the action
- enabled: Boolean flag to enable/disable the rule

### EventLog

Records all triggered events and resulting actions for audit and debugging.

- timestamp: When the event occurred
- event_type: The platform event that triggered the log entry
- rule_matched: Reference to the EventRule that was triggered (if any)
- action_taken: Description of the action performed
- result: Outcome of the action (success/failure with details)
- session_id: Associated session context
- agent_id: Agent that performed or was affected by the action

### IdleConfig

Configuration for idle detection and response behavior.

- threshold_duration: Time period after which an agent is considered idle
- action_on_idle: Action to take when idle threshold is reached (e.g., mark_inactive, notify_leader, reassign_tasks)
- notification_target: Who to notify when idle action is triggered
- auto_reassign: Boolean flag to enable automatic task reassignment

## Requirements

### Functional Requirements

1. **Plugin Hook Subscriptions**: Subscribe to OpenCode platform events including session lifecycle (created, updated, deleted, idle), tool execution (before, after), file changes (edited, watcher updated), message updates, and todo updates.

2. **Event-Condition-Action Rules**: Support user-defined rules that match specific events, evaluate optional conditions, and trigger predefined actions such as agent notifications, task status updates, or new agent spawning.

3. **Auto-Dispatch on Task Unblock**: When a blocked task's dependencies are all completed, automatically trigger notifications or agent spawning for the next dependent tasks.

4. **Idle Detection and Response**: Monitor agent activity and trigger configurable responses when agents exceed idle thresholds, including status updates and task reassignment notifications.

5. **File Change Monitoring**: Detect edits to specific files or file patterns and trigger notifications to relevant team members or automated actions.

6. **Session Lifecycle Reactions**: Respond to session events by updating team state, such as auto-joining agents on session start or cleaning up resources on session end.

7. **Configurable Event Rules**: Provide a configuration interface for users to define custom event-action mappings without requiring code changes.

8. **Event Logging and Audit Trail**: Maintain comprehensive logs of all triggered events, matched rules, and resulting actions for transparency and debugging.

### Non-Functional Requirements

1. **Performance**: Event processing must not introduce significant latency to platform operations, with rule evaluation completing within 100ms.

2. **Reliability**: Event processing should be resilient to failures, with failed actions logged and retried or escalated as appropriate.

3. **Scalability**: Support concurrent event processing for multiple teams and sessions without resource contention.

4. **Observability**: Provide metrics on event processing rates, rule match frequencies, and action success rates.

## Success Criteria

1. **Event Processing Coverage**: All specified OpenCode platform events are successfully subscribed to and processed without errors in 100% of test scenarios.

2. **Rule Matching Accuracy**: User-defined event rules correctly match events and trigger actions in 99% of evaluated conditions.

3. **Task Unblocking Automation**: Blocked tasks are automatically unblocked and agents notified within 5 seconds of dependency completion in 100% of test cases.

4. **Idle Detection Precision**: Agents are accurately marked idle after the configured threshold with less than 1% false positive rate.

5. **Audit Trail Completeness**: All triggered events and actions are logged with complete metadata in 100% of cases.

6. **Configuration Flexibility**: Users can define and modify event rules without system downtime, with changes taking effect within 30 seconds.

## Dependencies

- Feature 001 (Data Layer): Required for persistent storage of event rules and logs
- Feature 002 (Agent Lifecycle/Spawning): Required for automated agent spawning and status management
- Feature 004 (Team Topologies): Required for team context and agent coordination

## Implementation Notes

This specification focuses on functional behavior and user requirements. Implementation details such as specific technologies, APIs, or code patterns are intentionally omitted and will be addressed in the implementation phase.

## Roadmap Alignment

This feature maps to Priority 5 in the constitution roadmap (Plugin hook subscriptions) and supports the software-dev mission by enabling more efficient automated workflows in development teams.
