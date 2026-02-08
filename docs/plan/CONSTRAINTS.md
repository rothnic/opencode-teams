# Project Constraints & Invariants

This document defines the non-negotiable rules, technical invariants, and architectural constraints for the `opencode-teams` project. All implementations must adhere to these rules.

## 1. Data Integrity & Concurrency

### 1.1 Mandatory File Locking

- **Rule**: Every read or write operation on shared state (teams, tasks, inboxes) MUST be protected by an advisory file lock.
- **Implementation**: Use `fcntl` via Bun FFI (Foreign Function Interface) to ensure cross-process locking.
- **Lock Scope**: Locks should be at the team level (`.lock` file in the team directory or subdirectories) to prevent race conditions between concurrent agents.

### 1.2 Atomic Writes

- **Rule**: All state updates MUST be atomic.
- **Implementation**: Write data to a temporary file in the same directory, then use an atomic rename operation (e.g., `mv` or `os.replace` equivalent) to overwrite the target file.
- **Rationale**: Prevents partial writes from corrupting JSON state in the event of a crash or interruption.

### 1.3 Data Validation

- **Rule**: All data read from or written to disk MUST be validated at runtime.
- **Implementation**: Use `Zod` for schema definition and validation.
- **Invariant**: If a file on disk is corrupted or doesn't match the current schema, the system should fail loudly or attempt a safe migration, never proceed with invalid data.

## 2. Architectural Constraints

### 2.1 Native OpenCode Plugin

- **Constraint**: The core functionality MUST be implemented as a native OpenCode plugin using the `@opencode-ai/sdk`.
- **Tooling**: Tools must be registered via the `tool()` helper and run in-process within the OpenCode session.
- **No Sidecars**: Avoid separate MCP servers for core coordination; leverage the plugin runtime.

### 2.2 OpenCode Integration Layer

- **Constraint**: OpenCode is the primary integration layer for session and process management.
- **Spawning**: Use `opencode serve` + SDK + `session.create` + `prompt_async` for orchestrating agent sessions.
- **Lifecycle**: Hook into OpenCode events (e.g., `session.created`, `session.idle`) for agent lifecycle management.

### 2.3 Bun-Native Environment

- **Constraint**: The project is a Bun-native TypeScript project.
- **Dependencies**: Minimize external runtime dependencies. Prefer Bun built-ins (e.g., `Bun.file`, `Bun.spawn`, `Bun.write`).
- **No Python**: Do not use Python for any core components.

## 3. Behavioral Invariants

### 3.1 Task State Machine

- **Invariant**: Tasks follow a strict forward-only status transition: `pending` -> `in_progress` -> `completed`.
- **Constraint**: Regressing status (e.g., `completed` -> `pending`) is forbidden unless explicitly handled (e.g., via a "reopen" operation that cleans up side effects).
- **Dependency Guard**: A task cannot enter `in_progress` or `completed` if it has unmet dependencies (blocked by incomplete tasks), unless using the "Soft Blocking" claim override with explicit warnings.

### 3.2 Messaging Protocol

- **Constraint**: Use the **per-agent inbox model**. Each agent has its own JSON file containing an array of messages.
- **Efficiency**: Routing must be O(1) (append to specific file) rather than O(n) (scanning a shared directory).
- **Read Tracking**: Messages must track `read` status to support efficient long-polling.

### 3.3 Team Topologies

- **Requirement**: Support both **Flat** and **Hierarchical** team models via configuration.
- **Flat Model**: Agents are peers; coordination happens via a shared task backlog or conditional "backlog manager" agents.
- **Hierarchical Model**: A "Leader" agent tasks "Worker" agents and manages the plan.
- **Flexibility**: The system must be configurable to support these different interaction patterns without core code changes.

## 4. Path Conventions

- **Global Config**: `~/.config/opencode/opencode-teams/` (Preferences, Templates)
- **Project Storage**: `<project-root>/.opencode/opencode-teams/` (Teams, Tasks, Inboxes)
- **Rationale**: Keeps project-specific coordination data within the project boundary, facilitating local development and isolation.
