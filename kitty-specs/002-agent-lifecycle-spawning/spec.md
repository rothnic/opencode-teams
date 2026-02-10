# Feature Specification: Agent Lifecycle and Spawning

**Feature Branch**: 002-agent-lifecycle-spawning  
**Created**: 2026-02-10  
**Status**: Draft  
**Mission**: software-dev

## Overview

This feature implements comprehensive agent lifecycle management within the OpenCode platform, enabling dynamic spawning, monitoring, and termination of AI agents. The system provides robust mechanisms for agent creation, graceful shutdown protocols, failure detection, and automatic task reassignment. All functionality is scoped to the OpenCode backend only.

## User Scenarios and Testing

### P1: Leader Spawns New Teammate

**Given** a leader agent has identified a need for additional team capacity  
**When** the leader requests spawning of a new teammate with a specific prompt  
**Then** a new agent process is created, automatically joins the team, and begins executing the assigned prompt

### P2: Graceful Shutdown Request

**Given** a leader agent determines a teammate should be shut down  
**When** the leader requests graceful shutdown of the teammate  
**Then** the teammate receives the request, completes current work, confirms shutdown approval, and exits cleanly

### P3: Crash Detection and Task Reassignment

**Given** an agent is actively working on a task  
**When** the agent crashes or becomes unresponsive due to heartbeat timeout  
**Then** the system detects the failure, marks the agent inactive, and reassigns the owned task back to pending status

### P4: Force Kill Misbehaving Agent

**Given** a teammate refuses a graceful shutdown request  
**When** the leader issues a force-kill command  
**Then** the misbehaving agent process is immediately terminated

## Requirements

### Agent Spawning (FR-001)

The system must support creation of new agent processes via the host platform's session management, with automatic team integration and prompt execution initiation.

### Force Kill Capability (FR-002)

The system must provide immediate termination of agent processes that are misbehaving or stuck, bypassing graceful shutdown protocols when necessary.

### Shutdown Protocol (FR-003)

The system must implement a three-phase shutdown negotiation: shutdown request, agent approval/rejection response, and confirmation cycle completion.

### Heartbeat and Timeout Detection (FR-004)

Agents must periodically report liveness status; the system must detect stale agents based on heartbeat timestamps and mark them inactive.

### Agent Metadata Enrichment (FR-005)

Each agent must maintain comprehensive metadata including model name, working directory, color assignment, active state, session linkage, and last heartbeat timestamp.

### Session Management (FR-006)

The system must handle creation, attachment, and cleanup of host platform sessions for each agent, ensuring proper resource management.

### Idle Agent Detection (FR-007)

The system must monitor session idle events to identify and mark inactive agents, enabling resource reclamation.

### Task Reassignment on Agent Death (FR-008)

When an agent is killed or crashes, all tasks owned by that agent must be automatically reassigned to pending status for redistribution.

### Backend Scope Limitation (FR-009)

All agent lifecycle functionality must be scoped exclusively to the OpenCode backend; Claude CLI backend integration is explicitly excluded.

## Key Entities

### Agent

- model: The AI model identifier used by the agent
- cwd: Current working directory path
- color: Assigned color for visual identification
- is_active: Boolean indicating current active status
- session_id: Link to the host platform session
- heartbeat_ts: Timestamp of last liveness report

### ShutdownRequest

- requester_agent_id: ID of the agent requesting shutdown
- target_agent_id: ID of the agent to be shut down
- reason: Optional explanation for the shutdown request
- timestamp: When the request was issued

### ShutdownApproval

- request_id: Reference to the original shutdown request
- approved: Boolean indicating acceptance or rejection
- reason: Optional explanation for the decision
- timestamp: When the approval was provided

## Success Criteria

### Agent Spawning Success Rate

- Target: 99% of spawn requests result in successfully created and active agents within 30 seconds
- Measurement: Ratio of successful spawns to total spawn attempts over a 24-hour period

### Graceful Shutdown Completion Rate

- Target: 95% of shutdown requests result in clean agent termination without force-kill intervention
- Measurement: Ratio of graceful shutdowns to total shutdown requests over a 7-day period

### Crash Detection Accuracy

- Target: 98% of actual agent crashes are detected within 60 seconds of occurrence
- Measurement: Ratio of correctly detected crashes to total actual crashes over a 7-day period

### Task Reassignment Latency

- Target: 100% of tasks from crashed agents are reassigned within 5 minutes of crash detection
- Measurement: Maximum time from crash detection to task reassignment completion across all incidents

### Heartbeat Monitoring Coverage

- Target: 100% of active agents report heartbeats at least once every 30 seconds
- Measurement: Percentage of active agents with heartbeat timestamps within the last 30 seconds

## Edge Cases

### Concurrent Shutdown Requests

Multiple leaders simultaneously requesting shutdown of the same agent should be handled with proper sequencing and conflict resolution.

### Agent Spawn During Shutdown

Requests to spawn new agents while the system is shutting down should be queued or rejected based on system state.

### Heartbeat Network Interruptions

Temporary network issues causing heartbeat delays should not trigger false crash detections.

### Session Cleanup Failures

Failure to clean up host platform sessions after agent termination should not prevent new agent spawning.

### Task Reassignment Conflicts

Multiple agents attempting to claim reassigned tasks simultaneously should be resolved through proper locking mechanisms.

### Color Assignment Exhaustion

When all available colors are assigned to active agents, new agents should receive appropriate fallback assignments.

### Working Directory Conflicts

Agents spawned with conflicting working directory requirements should be handled through session isolation.

### Metadata Synchronization Delays

Temporary delays in metadata updates across distributed components should not cause inconsistent agent state views.
