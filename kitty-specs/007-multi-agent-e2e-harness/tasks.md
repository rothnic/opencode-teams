# Tasks: Multi-Agent E2E Test Harness

**Feature**: 007-multi-agent-e2e-harness
**Date**: 2026-02-10
**Spec**: `kitty-specs/007-multi-agent-e2e-harness/spec.md`
**Plan**: `kitty-specs/007-multi-agent-e2e-harness/plan.md`

## Overview

22 subtasks grouped into 4 work packages. All changes are additive: new test
infrastructure module, new agent templates, new test files. No modifications to
existing production code. No new runtime dependencies.

## Dependency Graph

```
WP01 (Harness Core + Types) ──┬──> WP03 (Test Scenarios)
                               │
WP02 (Agent Templates)     ───┘
                               │
                               └──> WP04 (Recording + Live Gating)
```

- WP01 is foundation (harness utilities, scenario types, harness unit tests).
- WP02 is independent (agent AGENT.md templates, no code deps).
- WP03 depends on WP01 + WP02 (scenario definitions + coordination flow tests).
- WP04 depends on WP01 (recording wrapper, live agent test gating).

## Work Packages

### WP01: E2E Harness Core and Scenario Types

**Target**: `src/testing/e2e-harness.ts`, `src/testing/scenarios/types.ts`, `tests/e2e-harness.test.ts`
**Dependencies**: None

| ID | Subtask | Target File |
|----|---------|-------------|
| T001 | Create `E2EScenario`, `E2EScenarioResult`, `E2EHarnessConfig` type definitions | `src/testing/scenarios/types.ts` |
| T002 | Implement `createTestEnvironment()`: mkdtemp, set OPENCODE_TEAMS_DIR, save/restore env | `src/testing/e2e-harness.ts` |
| T003 | Implement `destroyTestEnvironment()`: rmSync temp dir, restore env, cleanup tmux sessions | `src/testing/e2e-harness.ts` |
| T004 | Implement `setupTeamWithAgents()`: create team, register simulated agents with roles | `src/testing/e2e-harness.ts` |
| T005 | Implement `waitForCondition()`: poll state with configurable timeout and interval | `src/testing/e2e-harness.ts` |
| T006 | Implement `assertAllTasksCompleted()`: verify all tasks reached 'completed' status | `src/testing/e2e-harness.ts` |
| T007 | Implement `assertNoResidualState()`: verify cleanup left no temp dirs or processes | `src/testing/e2e-harness.ts` |
| T008 | Write harness unit tests: env isolation, setup/teardown, timeout enforcement, assertions | `tests/e2e-harness.test.ts` |

### WP02: E2E Agent Role Templates

**Target**: `agent/e2e-planner/AGENT.md`, `agent/e2e-builder/AGENT.md`, `agent/e2e-reviewer/AGENT.md`
**Dependencies**: None

| ID | Subtask | Target File |
|----|---------|-------------|
| T009 | Create e2e-planner AGENT.md: YAML frontmatter (model: google/antigravity-gemini-3-flash, tools, permissions), system prompt for creating team, task dependency graphs, assignment, rework handling | `agent/e2e-planner/AGENT.md` |
| T010 | Create e2e-builder AGENT.md: YAML frontmatter (model: google/antigravity-gemini-3-flash, tools, permissions), system prompt for joining team, claiming tasks, completing work, reporting | `agent/e2e-builder/AGENT.md` |
| T011 | Create e2e-reviewer AGENT.md: YAML frontmatter (model: google/antigravity-gemini-3-flash, tools, permissions), system prompt for reviewing completed tasks, approving or requesting rework with feedback | `agent/e2e-reviewer/AGENT.md` |

### WP03: Test Scenarios and Coordination Flow Tests

**Target**: `src/testing/scenarios/simple-planner-builder.ts`, `src/testing/scenarios/complex-review-rework.ts`, `tests/e2e-multi-agent.test.ts`
**Dependencies**: WP01, WP02

| ID | Subtask | Target File |
|----|---------|-------------|
| T012 | Define P1 simple scenario: planner + builder roster, single task, expected outcome | `src/testing/scenarios/simple-planner-builder.ts` |
| T013 | Define P2 complex scenario: planner + 2 builders + reviewer, dependency graph, review/rework expectations | `src/testing/scenarios/complex-review-rework.ts` |
| T014 | Test P1 AC1: both agents spawn, join team, visible in membership | `tests/e2e-multi-agent.test.ts` |
| T015 | Test P1 AC2: planner creates task → builder claims → builder completes → planner observes | `tests/e2e-multi-agent.test.ts` |
| T016 | Test P1 AC3: cleanup removes all temp dirs, tmux sessions, agent state | `tests/e2e-multi-agent.test.ts` |
| T017 | Test P2 AC1: dependency-aware scheduling (Task B held until Task A completes) | `tests/e2e-multi-agent.test.ts` |
| T018 | Test P2 AC2: parallel assignment (each builder gets different task, no double-assign) | `tests/e2e-multi-agent.test.ts` |
| T019 | Test P2 AC3+AC4: reviewer rejects → planner re-assigns with feedback → builder revises | `tests/e2e-multi-agent.test.ts` |
| T020 | Test P2 AC5: reviewer approves all → workflow marked complete | `tests/e2e-multi-agent.test.ts` |

### WP04: Recording Support and Live Agent Test Gating

**Target**: `src/testing/e2e-harness.ts`, `tests/e2e-multi-agent.test.ts`
**Dependencies**: WP01

| ID | Subtask | Target File |
|----|---------|-------------|
| T021 | Add `captureRecording()` to harness: wraps TmuxOperations.capturePaneOutput, writes to output dir | `src/testing/e2e-harness.ts` |
| T022 | Add E2E_LIVE environment gate: skip live agent tests when not set, with clear skip message | `tests/e2e-multi-agent.test.ts` |

## Sizing Summary

| WP | Subtasks | Source Files | Test Files | Estimated Effort |
|----|----------|-------------|------------|------------------|
| WP01 | 8 | 2 | 1 | Medium |
| WP02 | 3 | 0 (markdown) | 0 | Small |
| WP03 | 9 | 2 | 1 | Large |
| WP04 | 2 | 1 | 1 | Small |
| **Total** | **22** | **5 unique** | **2 new** | |

## Breaking Change Analysis

**None.** All changes are additive: new `src/testing/` directory, new `agent/e2e-*` templates,
new test files. No modifications to existing production code or test files.
