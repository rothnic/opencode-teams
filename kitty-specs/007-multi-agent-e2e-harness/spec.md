# Feature Specification: Multi-Agent E2E Test Harness

**Feature Branch**: `007-multi-agent-e2e-harness`
**Created**: 2026-02-10
**Status**: Draft
**Mission**: software-dev

## Overview

This feature adds an end-to-end testing harness that exercises real multi-agent coordination workflows in isolated temporary environments. The harness spawns actual agents (using the `google/antigravity-gemini-3-flash` model via the Antigravity provider) with predefined roles, presents them with progressively complex coordination problems, and verifies that teams self-organize, distribute work, handle dependencies, conduct reviews, and complete rework cycles correctly. Each test run is fully isolated in a temporary directory, cleaned up after execution, and optionally recorded for playback.

## User Scenarios & Testing

### User Story 1 - Simple Two-Agent Coordination (Priority: P1)

As a plugin developer, I want to run an E2E test where a planner agent and a builder agent collaborate on a simple task, so that I can verify the basic team-creation, task-assignment, and task-completion coordination loop works end-to-end with real agents.

**Why this priority**: This is the foundational coordination pattern. Every more complex scenario builds on a planner distributing work to a builder and receiving completion signals. If this loop breaks, nothing else works.

**Independent Test**: Can be fully tested by spawning two agents in a temp directory, having the planner create a team and assign a single task to the builder, and verifying the task reaches "completed" status. Delivers confidence that the core spawn-coordinate-complete cycle works.

**Acceptance Scenarios**:

1. **Given** a clean temporary work environment and the harness configured with `google/antigravity-gemini-3-flash`, **When** the harness spawns a planner and a builder agent, **Then** both agents start successfully, join the same team, and are visible in team membership.
2. **Given** the planner has created a task and assigned it to the builder, **When** the builder processes and completes the task, **Then** the task status transitions to "completed" and the planner can observe the completion.
3. **Given** the test run completes (pass or fail), **When** cleanup executes, **Then** all temporary directories, agent processes, and tmux sessions are fully removed with no residual state.

---

### User Story 2 - Complex Multi-Agent Workflow with Review Cycles (Priority: P2)

As a plugin developer, I want to run an E2E test where a planner coordinates two builders and a reviewer on a task graph with dependencies, so that I can verify parallel task assignment, dependency-aware scheduling, review feedback, and rework cycles work correctly.

**Why this priority**: This tests the realistic coordination patterns users actually need: multiple workers in parallel, a reviewer gating quality, and a planner handling rework when reviews fail. It validates the plugin's ability to orchestrate non-trivial workflows.

**Independent Test**: Can be fully tested by spawning four agents, having the planner create a dependency graph of tasks, distributing independent tasks to the two builders in parallel, routing completed work through the reviewer, and verifying the planner handles rework requests by re-assigning tasks back to builders.

**Acceptance Scenarios**:

1. **Given** a planner, two builders, and a reviewer are spawned, **When** the planner creates tasks with dependencies (Task B depends on Task A), **Then** the planner assigns Task A first and holds Task B until Task A completes.
2. **Given** two independent tasks exist, **When** the planner distributes them, **Then** each builder receives a different task and works on them concurrently (no double-assignment).
3. **Given** a builder completes a task, **When** the planner routes it to the reviewer, **Then** the reviewer evaluates the work and returns either an approval or a rework request with feedback.
4. **Given** the reviewer returns a rework request, **When** the planner receives it, **Then** the planner re-assigns the task (with reviewer feedback attached) back to a builder for revision.
5. **Given** the reviewer approves all tasks, **When** the planner checks the overall status, **Then** the workflow is marked as complete.

---

### User Story 3 - Test Session Recording (Priority: P3)

As a plugin developer, I want to capture recordings of agent interactions during E2E tests, so that I can review what happened during test runs, debug failures, and demonstrate multi-agent coordination to stakeholders.

**Why this priority**: Observability is important but secondary to the tests actually working. Recordings are a debugging and communication aid, not a core coordination feature.

**Independent Test**: Can be fully tested by running any E2E scenario with recording enabled and verifying that a playback-compatible recording file is produced in the output directory.

**Acceptance Scenarios**:

1. **Given** recording is enabled for a test run, **When** agents interact during the test, **Then** a recording file is produced that captures the terminal output of each agent's tmux pane.
2. **Given** a recording file was produced, **When** a developer accesses it after the test, **Then** the recording can be replayed to show the timeline of agent interactions.
3. **Given** recording is disabled (default), **When** a test runs, **Then** no recording overhead is added and no recording files are created.

---

### User Story 4 - Progressive Complexity Test Suite (Priority: P4)

As a plugin developer, I want a suite of test scenarios that increase in complexity (from single-task to multi-dependency-with-rework), so that I can isolate failures to specific coordination capabilities and track regression across releases.

**Why this priority**: A well-structured suite makes the harness useful over time but depends on the individual scenarios (P1, P2) already working. This story is about organizing and scaling the test coverage.

**Independent Test**: Can be tested by running the full suite and verifying each scenario passes independently, with clear per-scenario pass/fail reporting.

**Acceptance Scenarios**:

1. **Given** the test suite is executed, **When** a scenario fails, **Then** the failure report identifies which specific scenario and acceptance criterion failed, without blocking other scenarios from running.
2. **Given** the suite includes scenarios of varying complexity, **When** a developer adds a new scenario, **Then** they can do so by following a documented pattern without modifying the harness core.

---

### Edge Cases

- What happens when an agent fails to spawn (e.g., model unavailable)? The harness detects the spawn failure within its startup timeout, marks the test as failed with a clear error message, and proceeds to cleanup.
- What happens when an agent hangs and never completes its task? The harness enforces a per-scenario timeout. When exceeded, the test is marked as timed out, all agents are force-killed, and cleanup runs.
- What happens when cleanup itself fails (e.g., tmux session won't die)? The harness logs the cleanup failure as a warning and makes a best-effort attempt at force cleanup. Stale processes are reported so a developer can intervene.
- What happens when two builders try to claim the same task? The plugin's existing atomic task-claiming mechanism prevents double-assignment. The harness verifies this by checking that each completed task has exactly one assignee.
- What happens when the reviewer rejects a task multiple times? The harness enforces a maximum rework cycle count per scenario (configurable, default 3). If exceeded, the scenario is marked as failed with a "rework loop" error.

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a test harness that creates isolated temporary directories for each E2E test run, with guaranteed cleanup after execution regardless of test outcome.
- **FR-002**: System MUST spawn real agents using the `google/antigravity-gemini-3-flash` model through the Antigravity provider for all E2E tests.
- **FR-003**: System MUST support agent role templates (planner, builder, reviewer) that define each agent's behavior, tool permissions, and coordination responsibilities.
- **FR-004**: System MUST support a "simple scenario" with one planner agent and one builder agent coordinating on task assignment and completion.
- **FR-005**: System MUST support a "complex scenario" with one planner, two builders, and one reviewer coordinating on dependency-aware task graphs with parallel execution and review/rework cycles.
- **FR-006**: System MUST enforce per-scenario timeouts to prevent hung agents from blocking the test suite.
- **FR-007**: System MUST optionally capture terminal recordings of agent tmux sessions during test execution for post-run playback.
- **FR-008**: System MUST provide clear per-scenario pass/fail reporting that identifies which acceptance criteria succeeded or failed.
- **FR-009**: System MUST clean up all spawned processes (agents, tmux sessions, server instances) after each test run, even on failure or timeout.
- **FR-010**: System MUST support adding new test scenarios following a documented, repeatable pattern without modifying the harness core.
- **FR-011**: The planner agent MUST handle rework cycles when the reviewer rejects completed work, re-assigning tasks with reviewer feedback to a builder.
- **FR-012**: The planner agent MUST respect task dependencies, only assigning tasks whose dependencies are all satisfied.

### Non-Functional Requirements

- Agent spawning and team setup for a scenario MUST complete within 60 seconds.
- Individual simple scenarios MUST complete within 5 minutes.
- Individual complex scenarios MUST complete within 10 minutes.
- Cleanup MUST complete within 30 seconds per scenario.
- The harness MUST work in CI environments (headless, no interactive prompts).

### Key Entities

- **Test Scenario**: A self-contained E2E test definition specifying the agent roster (roles, count), the task graph (tasks, dependencies), expected coordination behavior, acceptance criteria, and timeout configuration.
- **Test Harness**: The runtime orchestrator that provisions temporary environments, spawns agents, monitors progress, enforces timeouts, collects recordings, verifies acceptance criteria, and performs cleanup.
- **Agent Role Template**: A configuration defining an agent's system prompt, tool permissions, and behavioral expectations (planner coordinates and delegates; builder executes tasks; reviewer evaluates completed work).
- **Test Recording**: A captured terminal session (per-agent or combined) that can be replayed to observe agent interactions during a test run.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The simple scenario (planner + builder) passes end-to-end with a task reaching "completed" status in under 5 minutes.
- **SC-002**: The complex scenario (planner + 2 builders + reviewer) passes end-to-end including at least one review/rework cycle in under 10 minutes.
- **SC-003**: Zero residual temporary directories, tmux sessions, or agent processes remain after test cleanup completes.
- **SC-004**: All E2E tests use the `google/antigravity-gemini-3-flash` model exclusively (no fallback to other models).
- **SC-005**: When recording is enabled, a valid playback file is produced for each participating agent.
- **SC-006**: A new scenario can be added by creating a single scenario definition file without modifying the harness code.

## Dependencies

- Feature 001 (Robust Coordination Core): Required for atomic task operations, team state management, and messaging.
- Feature 002 (Agent Lifecycle Spawning): Required for agent spawning, terminal session management, and server lifecycle.
- Feature 004 (Team Topologies and Roles): Required for role-based agent configuration and permission enforcement.
- Feature 005 (Event-Driven Agent Dispatch): Required for automatic task unblocking events and idle-agent dispatch rules used in complex scenarios.

## Assumptions

- The Antigravity provider and `google/antigravity-gemini-3-flash` model are available in the test environment and do not require additional API key setup beyond what is already configured.
- A terminal multiplexer (tmux) is installed and available in both local development and CI environments.
- Agents do not need to write production-quality code; they need to exercise the coordination primitives (create teams, assign tasks, send messages, complete tasks, submit reviews).
- The existing test framework and established E2E test patterns in the project are used for test orchestration.
- Recording uses terminal session capture capabilities already available in the environment.
- Test scenarios are coordination-focused (testing the plugin's primitives), not code-generation-focused.
