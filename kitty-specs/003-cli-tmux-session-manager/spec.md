# Feature Specification: CLI and Tmux Session Manager

**Feature Branch**: 003-cli-tmux-session-manager
**Created**: 2026-02-10
**Status**: Draft
**Mission**: software-dev

## Overview

The CLI and Tmux Session Manager provides a standalone command-line interface for managing multi-agent coding sessions within tmux environments. It enables users to launch, monitor, and control agent teams through terminal-based session management, with automatic pane layout and session lifecycle handling.

## User Scenarios and Testing

### P1: Launch Session from CLI (Priority: P1)

As a user, I want to run a single CLI command from my project directory so that a tmux session appears with the coding server and tiled agent panes.

**Why this priority**: This is the fundamental entry point. Without launching sessions, no other CLI feature has value.

**Independent Test**: Can be fully tested by running the CLI binary in a project directory and verifying a tmux session is created with the server running.

**Acceptance Scenarios**:

1. **Given** a user is in a project directory with no active session, **When** they run the CLI launch command, **Then** a new tmux session is created with the coding server running in the first pane within 15 seconds.
2. **Given** a user runs the launch command, **When** the session starts, **Then** each configured agent appears in its own labeled pane with the name@team convention applied.
3. **Given** a tmux session already exists for the current project, **When** the user runs the launch command again, **Then** the existing session is attached rather than creating a duplicate.

---

### P2: Monitor Agent Progress (Priority: P2)

As a user, I want to attach to an existing session so that I can monitor agent progress across multiple terminal panes.

**Why this priority**: Once sessions exist, users need to observe and interact with running agents.

**Independent Test**: Can be tested by launching a session, detaching, then reattaching and verifying all panes are visible with correct labels.

**Acceptance Scenarios**:

1. **Given** a tmux session is running with active agents, **When** the user runs the attach command, **Then** the terminal switches to the tmux session showing all agent panes.
2. **Given** a user is attached to a session, **When** they request a specific pane layout (tiled, main-vertical, even-horizontal), **Then** the panes rearrange to match the requested layout.

---

### P3: View Dashboard (Priority: P3)

As a user, I want to view a dashboard so that I can see task completion status, active agents, and recent messages.

**Why this priority**: Provides high-level oversight that complements per-pane monitoring.

**Independent Test**: Can be tested by creating a session with tasks and agents, running the dashboard command, and verifying task/agent/message data appears.

**Acceptance Scenarios**:

1. **Given** a team session is running with assigned tasks, **When** the user runs the dashboard command, **Then** task progress, agent assignments, and recent messages are displayed with less than 5 second refresh intervals.
2. **Given** no active sessions exist, **When** the user runs the dashboard command, **Then** a clear message indicates no active sessions are found.

---

### P4: Automatic Cleanup (Priority: P4)

As a user, I want the tmux session to automatically clean up when all agents finish work and the last client disconnects.

**Why this priority**: Prevents stale sessions from accumulating, but requires all other features to function first.

**Independent Test**: Can be tested by creating a session, completing all tasks, detaching all clients, and verifying the tmux session is destroyed.

**Acceptance Scenarios**:

1. **Given** all agents in a session have completed their tasks, **When** the last attached client detaches, **Then** the tmux session is automatically destroyed and all resources released.
2. **Given** auto-cleanup is disabled in configuration, **When** all agents finish and clients detach, **Then** the session persists until manually destroyed.

---

### Edge Cases

- What happens when tmux is not installed or not found in PATH?
- How does the system handle launching from a directory that is not a recognized project?
- What happens when available terminal dimensions are too small to display the requested pane layout?
- How does the system behave when the coding server fails to start within the expected timeout?
- What happens when a user attempts to attach to a session owned by a different user?
- How does the system handle pane creation when the maximum tmux pane count is reached?
- What happens during session cleanup if an agent pane is still executing a long-running process?
- How does the system recover from a tmux server crash while agents are active?

## Requirements

### Functional Requirements

- **FR-001**: The system must provide a standalone CLI binary (opencode-teams) that can be invoked from any project directory to manage agent sessions.
- **FR-002**: The system must detect whether a tmux session is already running for the current project, using project directory as the unique identifier.
- **FR-003**: The system must spawn the host coding platform in a new tmux session when no existing session is detected.
- **FR-004**: The system must support at least three pane layout arrangements: tiled, main-vertical, and even-horizontal.
- **FR-005**: The system must create individual tmux panes for each agent, labeled with the name@team naming convention.
- **FR-006**: The system must automatically dispose of tmux sessions when auto-cleanup is enabled and the last client disconnects after all tasks complete.
- **FR-007**: The system must provide a dashboard command displaying real-time task progress, active agent states, and recent messages.
- **FR-008**: The system must provide attach and detach commands for seamless switching between agent panes and sessions.
- **FR-009**: The system must provide a status command showing an overview of all running sessions, agents, and their current states.
- **FR-010**: The system must persist user preferences for layout, auto-cleanup behavior, and pane sizing across sessions via a configuration file.

### Non-Functional Requirements

- Session creation must complete within 15 seconds.
- Pane layout rearrangement must complete within 2 seconds.
- Dashboard refresh interval must be configurable with a default of less than 5 seconds.
- The CLI must provide clear error messages for all failure conditions (tmux not found, invalid project, etc.).

## Key Entities

### Session

Represents a tmux session bound to a specific project, containing metadata about the coding server, active agents, and session state.

- project_dir: Absolute path to the project directory
- session_name: Unique tmux session name derived from project
- server_pane_id: Identifier for the pane running the coding server
- agent_panes: List of pane identifiers mapped to agents
- created_timestamp: When the session was created
- auto_cleanup_enabled: Whether automatic cleanup is active

### Pane

Represents an individual tmux pane assigned to a specific agent, with layout positioning and activity tracking.

- pane_id: Unique tmux pane identifier
- agent_name: Name of the assigned agent
- team_name: Team the agent belongs to
- label: Display label in name@team format
- layout_position: Position within the current layout arrangement

### CLIConfig

Contains user preferences for tmux layout options, automatic cleanup behavior, and pane sizing configurations.

- default_layout: Preferred pane layout (tiled, main-vertical, even-horizontal)
- auto_cleanup: Boolean flag for automatic session cleanup
- pane_min_width: Minimum pane width in columns
- pane_min_height: Minimum pane height in rows
- dashboard_refresh_interval: Dashboard update frequency in seconds

## Success Criteria

### Measurable Outcomes

- **SC-001**: CLI binary executes successfully from any project directory and creates tmux session within 15 seconds.
- **SC-002**: Tmux session detection accurately identifies running coding servers for current project with 100% accuracy.
- **SC-003**: Pane layout management supports all three layout types with proper agent assignment and label display.
- **SC-004**: Session cleanup automatically disposes sessions when conditions are met with no manual intervention required.
- **SC-005**: Dashboard displays accurate task progress, message flow, and team membership with configurable refresh under 5 seconds.
- **SC-006**: Status command provides accurate overview of all running sessions and agent states.
- **SC-007**: Configuration persists user preferences across sessions without data loss.

## Dependencies

- Feature 002 (Agent Lifecycle and Spawning): Required for agent process management within panes.
- Feature 001 (Robust Coordination Core): Required for task and message data displayed in dashboard.
- tmux availability on the host system.
