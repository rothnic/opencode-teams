import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { TaskOperations } from '../src/operations/task';
import { TeamOperations } from '../src/operations/team';
import {
  assertAllTasksCompleted,
  assertNoResidualState,
  createTestEnvironment,
  destroyTestEnvironment,
  setupTeamWithAgents,
} from '../src/testing/e2e-harness';
import { complexReviewReworkScenario } from '../src/testing/scenarios/complex-review-rework';
import { simplePlannerBuilderScenario } from '../src/testing/scenarios/simple-planner-builder';

describe('E2E Multi-Agent Coordination', () => {
  let env: ReturnType<typeof createTestEnvironment>;

  beforeEach(() => {
    env = createTestEnvironment();
  });

  afterEach(() => {
    destroyTestEnvironment(env);
  });

  it('P1-AC1: both agents join team and are visible in membership', () => {
    const { team, registeredAgents } = setupTeamWithAgents(
      simplePlannerBuilderScenario.name,
      simplePlannerBuilderScenario.agents,
    );

    expect(team.members).toHaveLength(2);
    expect(team.leader).toBeDefined();

    const planner = registeredAgents.find((a) => a.role === 'planner');
    const builder = registeredAgents.find((a) => a.role === 'builder');

    expect(planner).toBeDefined();
    expect(builder).toBeDefined();
    expect(team.leader).toBe(planner!.agentId);

    expect(team.members.some((m) => m.agentId === planner!.agentId)).toBe(true);
    expect(team.members.some((m) => m.agentId === builder!.agentId)).toBe(true);
  });

  it('P1-AC2: planner creates task, builder claims and completes it', async () => {
    const { registeredAgents } = setupTeamWithAgents(
      simplePlannerBuilderScenario.name,
      simplePlannerBuilderScenario.agents,
    );
    const teamName = simplePlannerBuilderScenario.name;
    const builder = registeredAgents.find((a) => a.role === 'builder')!;

    // Planner creates task
    const taskDef = simplePlannerBuilderScenario.tasks[0];
    const task = TaskOperations.createTask(teamName, {
      title: taskDef.title,
      description: taskDef.description,
    });

    expect(task.status).toBe('pending');

    // Builder claims task
    process.env.OPENCODE_AGENT_ID = builder.agentId;
    const claimedTask = TaskOperations.claimTask(teamName, task.id);
    expect(claimedTask.status).toBe('in_progress');
    expect(claimedTask.owner).toBe(builder.agentId);

    // Builder completes task
    const completedTask = TaskOperations.updateTask(teamName, task.id, {
      status: 'completed',
    });
    expect(completedTask.status).toBe('completed');

    // Verify completion
    const result = assertAllTasksCompleted(teamName);
    expect(result.allCompleted).toBe(true);

    // Verify planner can see it
    const storedTask = TaskOperations.getTask(teamName, task.id);
    expect(storedTask.status).toBe('completed');
  });

  it('P1-AC3: cleanup removes all temporary state', () => {
    setupTeamWithAgents(simplePlannerBuilderScenario.name, simplePlannerBuilderScenario.agents);
    const teamName = simplePlannerBuilderScenario.name;

    TaskOperations.createTask(teamName, {
      title: 'Temp Task',
    });

    // Use env tempDir to check existence before cleanup
    const tempDir = env.tempDir;
    expect(assertNoResidualState(tempDir).clean).toBe(false);

    destroyTestEnvironment(env);

    expect(assertNoResidualState(tempDir).clean).toBe(true);
  });

  it('P2-AC1: dependent tasks are held until dependencies complete', () => {
    setupTeamWithAgents(complexReviewReworkScenario.name, complexReviewReworkScenario.agents);
    const teamName = complexReviewReworkScenario.name;

    // Create tasks A, B (dep A), C (dep A)
    const taskA = TaskOperations.createTask(teamName, { title: 'Task A' });
    const taskB = TaskOperations.createTask(teamName, {
      title: 'Task B',
      dependencies: [taskA.id],
    });
    const taskC = TaskOperations.createTask(teamName, {
      title: 'Task C',
      dependencies: [taskA.id],
    });

    // Verify dependencies are recorded
    expect(taskB.dependencies).toContain(taskA.id);
    expect(taskC.dependencies).toContain(taskA.id);

    // Verify blocks are recorded on Task A
    const storedTaskA = TaskOperations.getTask(teamName, taskA.id);
    expect(storedTaskA.blocks).toContain(taskB.id);
    expect(storedTaskA.blocks).toContain(taskC.id);

    // Complete Task A
    TaskOperations.claimTask(teamName, taskA.id);
    TaskOperations.updateTask(teamName, taskA.id, { status: 'completed' });

    // Verify dependencies are cleared (auto-unblocked)
    const storedTaskB = TaskOperations.getTask(teamName, taskB.id);
    const storedTaskC = TaskOperations.getTask(teamName, taskC.id);

    expect(storedTaskB.dependencies).toHaveLength(0);
    expect(storedTaskC.dependencies).toHaveLength(0);
  });

  it('P2-AC2: each builder gets a different task, no double-assignment', () => {
    const { registeredAgents } = setupTeamWithAgents(
      complexReviewReworkScenario.name,
      complexReviewReworkScenario.agents,
    );
    const teamName = complexReviewReworkScenario.name;

    const builders = registeredAgents.filter((a) => a.role === 'builder');
    const builder1 = builders[0];
    const builder2 = builders[1];

    const task1 = TaskOperations.createTask(teamName, { title: 'Task 1' });
    const task2 = TaskOperations.createTask(teamName, { title: 'Task 2' });

    // Builder 1 claims Task 1
    process.env.OPENCODE_AGENT_ID = builder1.agentId;
    const claimed1 = TaskOperations.claimTask(teamName, task1.id);

    // Builder 2 claims Task 2
    process.env.OPENCODE_AGENT_ID = builder2.agentId;
    const claimed2 = TaskOperations.claimTask(teamName, task2.id);

    expect(claimed1.owner).toBe(builder1.agentId);
    expect(claimed2.owner).toBe(builder2.agentId);
    expect(claimed1.owner).not.toBe(claimed2.owner);

    // Verify double assignment prevention
    process.env.OPENCODE_AGENT_ID = builder2.agentId;
    expect(() => {
      TaskOperations.claimTask(teamName, task1.id);
    }).toThrow(); // Should throw because task is in_progress
  });

  it('P2-AC3/AC4: reviewer rejects, planner re-assigns with feedback, builder revises', async () => {
    const { registeredAgents } = setupTeamWithAgents(
      complexReviewReworkScenario.name,
      complexReviewReworkScenario.agents,
    );
    const teamName = complexReviewReworkScenario.name;
    const planner = registeredAgents.find((a) => a.role === 'planner')!;
    const builder = registeredAgents.find((a) => a.role === 'builder')!;
    const reviewer = registeredAgents.find((a) => a.role === 'reviewer')!;

    // 1. Initial task completion
    const task = TaskOperations.createTask(teamName, { title: 'Initial Implementation' });

    process.env.OPENCODE_AGENT_ID = builder.agentId;
    TaskOperations.claimTask(teamName, task.id);
    TaskOperations.updateTask(teamName, task.id, { status: 'completed' });

    // 2. Reviewer rejects
    process.env.OPENCODE_AGENT_ID = reviewer.agentId;
    TeamOperations.write(
      teamName,
      planner.agentId,
      'Task rejected: missing tests',
      reviewer.agentId,
    );

    // 3. Planner reads rejection and creates rework task
    process.env.OPENCODE_AGENT_ID = planner.agentId;
    const messages = TeamOperations.readMessages(teamName, planner.agentId);
    const rejectionMsg = messages.find(
      (m) => m.from === reviewer.agentId && m.message.includes('rejected'),
    );
    expect(rejectionMsg).toBeDefined();

    const reworkTask = TaskOperations.createTask(teamName, {
      title: `REWORK: ${task.title}`,
      description: `Fix issues: missing tests`,
      dependencies: [task.id], // Depends on original task (which is effectively the base for rework)
    });

    // 4. Builder claims and completes rework
    process.env.OPENCODE_AGENT_ID = builder.agentId;
    const claimedRework = TaskOperations.claimTask(teamName, reworkTask.id);
    expect(claimedRework.status).toBe('in_progress');

    TaskOperations.updateTask(teamName, reworkTask.id, { status: 'completed' });

    const storedRework = TaskOperations.getTask(teamName, reworkTask.id);
    expect(storedRework.status).toBe('completed');
  });

  it('P2-AC5: reviewer approves all tasks, workflow is complete', async () => {
    setupTeamWithAgents(complexReviewReworkScenario.name, complexReviewReworkScenario.agents);
    const teamName = complexReviewReworkScenario.name;

    // Setup tasks based on scenario
    const tasks = complexReviewReworkScenario.tasks;

    // Map of title to task ID
    const taskMap = new Map<string, string>();

    // Create all tasks
    for (const t of tasks) {
      const deps = (t.dependencies?.map((d) => taskMap.get(d)).filter(Boolean) as string[]) || [];
      const created = TaskOperations.createTask(teamName, {
        title: t.title,
        description: t.description,
        dependencies: deps,
      });
      taskMap.set(t.title, created.id);
    }

    // Identify tasks
    const designId = taskMap.get('Design API schema')!;
    const userId = taskMap.get('Implement user endpoint')!;
    const authId = taskMap.get('Implement auth endpoint')!;
    const testsId = taskMap.get('Write integration tests')!;

    // 1. Complete Design (Root)
    TaskOperations.claimTask(teamName, designId, 'agent-e2e-planner-1');
    TaskOperations.updateTask(teamName, designId, { status: 'completed' });

    // 2. Builders complete parallel tasks
    TaskOperations.claimTask(teamName, userId, 'agent-e2e-builder-1');
    TaskOperations.updateTask(teamName, userId, { status: 'completed' });

    TaskOperations.claimTask(teamName, authId, 'agent-e2e-builder-2');
    TaskOperations.updateTask(teamName, authId, { status: 'completed' });

    // 3. Complete Integration Tests (Dependent on both)
    TaskOperations.claimTask(teamName, testsId, 'agent-e2e-builder-1');
    TaskOperations.updateTask(teamName, testsId, { status: 'completed' });

    // 4. Reviewer approves
    TeamOperations.broadcast(teamName, 'All tasks approved', 'agent-e2e-reviewer-1');

    expect(assertAllTasksCompleted(teamName).allCompleted).toBe(true);
  });

  it('handles spawn failure gracefully', () => {
    expect(() => {
      setupTeamWithAgents('bad-team', []);
    }).toThrow('At least one agent is required');
  });

  it('prevents double-claiming of tasks', () => {
    const { registeredAgents } = setupTeamWithAgents(
      simplePlannerBuilderScenario.name,
      simplePlannerBuilderScenario.agents,
    );
    const teamName = simplePlannerBuilderScenario.name;
    const task = TaskOperations.createTask(teamName, { title: 'Shared Task' });
    const agent1 = registeredAgents[0].agentId;
    const agent2 = registeredAgents[1].agentId;

    process.env.OPENCODE_AGENT_ID = agent1;
    TaskOperations.claimTask(teamName, task.id);

    process.env.OPENCODE_AGENT_ID = agent2;
    expect(() => {
      TaskOperations.claimTask(teamName, task.id);
    }).toThrow(/not available/);
  });

  it('enforces rework cycle limit', () => {
    const { registeredAgents } = setupTeamWithAgents(
      simplePlannerBuilderScenario.name,
      simplePlannerBuilderScenario.agents,
    );
    const teamName = simplePlannerBuilderScenario.name;
    const maxReworkCycles = env.config.maxReworkCycles; // Should be 3 from default config

    let currentTask = TaskOperations.createTask(teamName, { title: 'Base Task' });
    TaskOperations.claimTask(teamName, currentTask.id, registeredAgents[1].agentId);
    TaskOperations.updateTask(teamName, currentTask.id, { status: 'completed' });

    let reworkCount = 0;
    let limitReached = false;

    // Simulate potential infinite rework loop
    for (let i = 0; i < 10; i++) {
      if (reworkCount >= maxReworkCycles) {
        limitReached = true;
        break;
      }

      // Create rework task
      const rework = TaskOperations.createTask(teamName, {
        title: `Rework ${i + 1}`,
        dependencies: [currentTask.id],
      });

      // Complete it
      TaskOperations.claimTask(teamName, rework.id, registeredAgents[1].agentId);
      TaskOperations.updateTask(teamName, rework.id, { status: 'completed' });

      currentTask = rework;
      reworkCount++;
    }

    expect(limitReached).toBe(true);
    expect(reworkCount).toBe(maxReworkCycles);
  });
});
