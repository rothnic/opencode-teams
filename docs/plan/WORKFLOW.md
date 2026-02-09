# Execution Workflow

This document describes the iterative verification loop for executing the implementation
phases. Each development session should follow this workflow to ensure quality and adherence
to constraints.

## 1. Development Loop

For each task in a phase:

1. **Analyze**: Review the task requirements and the relevant entries in `CONSTRAINTS.md`.
2. **Implement**: Write the code following the project's TypeScript and Bun standards.
3. **Unit Test**: Create or update tests in the `tests/` directory. Use `bun test` for
   verification.
4. **Self-Verify**: Verify the task against the specific criteria listed in `PHASES.md`.
5. **Audit**: Check for adherence to constraints (e.g., "Did I add file locking to this new
   operation?").

## 2. Phase Transition

Before declaring a phase "Complete" and moving to the next:

1. **Full Test Suite**: Run all project tests: `bun test`.
2. **Lint & Typecheck**: Run `mise run lint` and `mise run typecheck`.
3. **Phase Audit**: Step through every "Phase Verification Criteria" in `PHASES.md` and
   confirm it is met.
4. **Stress Test**: If the phase involves concurrency or state, run a multi-agent simulation
   to ensure stability.
5. **Documentation**: Update `PROGRESS.md` or the relevant beads issues.

## 3. Handling Verification Failure

If a verification criterion fails:

1. **Stop**: Do not proceed to the next phase.
2. **Analyze**: Determine if the failure is a bug in the implementation or a flaw in the
   phase design.
3. **Remediate**: - If a bug: Fix it and re-verify.
   - If a design flaw: Update `PHASES.md` or
     `CONSTRAINTS.md` to reflect the new understanding,
     and add remediation tasks to the current phase.
4. **Re-verify**: Re-run the full Phase Transition checklist.

## 4. Continuity for New Sessions

Since work may span multiple agent sessions:

1. **Context Recovery**: New sessions should start by reading `docs/plan/CONSTRAINTS.md`
   and the current phase in `docs/plan/PHASES.md`.
2. **State Check**: Use `bd ready` and `bd list --status=in_progress` to see where the
   previous session left off.
3. **Verification Check**: Verify that the "completed" tasks of the current phase actually
   meet their criteria before starting new tasks.
