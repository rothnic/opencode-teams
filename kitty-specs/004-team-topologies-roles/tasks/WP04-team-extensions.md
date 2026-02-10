---
work_package_id: WP04
title: Team Extensions
lane: planned
dependencies: []
subtasks: [T021, T022, T023, T024, T025]
history:
- date: '2026-02-10'
  action: created
  by: planner
---

# WP04: Team Extensions

**Implementation command**: `spec-kitty implement WP04 --base WP03`

## Objective

Add template-based team creation, topology enforcement on task claiming, team description
field support, and team deletion to `src/operations/team.ts`.

## Context

- **team.ts**: `src/operations/team.ts` has TeamOperations object with spawnTeam, requestJoin, messaging
- **task.ts**: `src/operations/task.ts` has TaskOperations with claimTask, updateTask
- **Templates**: TemplateOperations from WP02 provides load/save/list
- **Permissions**: role-permissions.ts from WP03 provides guardToolPermission
- **Schemas**: Extended TeamConfigSchema from WP01 with topology, description, roles

## Subtasks

### T021: Implement spawnTeamFromTemplate

**Purpose**: Create a team from a template, pre-configuring roles and default tasks.

**Steps**:

1. Add to TeamOperations in `src/operations/team.ts`:

```typescript
spawnTeamFromTemplate: (
  teamName: string,
  templateName: string,
  leaderInfo: LeaderInfo = {},
  options?: { description?: string },
): TeamConfig => {
  // Load template
  const template = TemplateOperations.load(templateName);

  // Create team with template config
  const config = TeamOperations.spawnTeam(teamName, leaderInfo);

  // Update team config with template fields
  const updatedConfig: TeamConfig = {
    ...config,
    topology: template.topology,
    description: options?.description || template.description,
    templateSource: templateName,
    roles: template.roles,
    workflowConfig: template.workflowConfig,
  };

  // Write updated config
  writeAtomicJSON(getTeamConfigPath(teamName), updatedConfig);

  // Create default tasks if template defines them
  if (template.defaultTasks) {
    for (const taskInput of template.defaultTasks) {
      TaskOperations.createTask(teamName, taskInput);
    }
  }

  return updatedConfig;
},
```

2. Import TemplateOperations at top of team.ts

**Validation**:
- [ ] Creates team with template's topology
- [ ] Creates team with template's roles
- [ ] Creates default tasks from template
- [ ] Stores templateSource reference
- [ ] Template not found throws error

---

### T022: Add Topology Enforcement to Task Claiming

**Purpose**: In hierarchical topology, prevent workers from self-assigning tasks.

**Steps**:

1. Modify TaskOperations.claimTask in `src/operations/task.ts`:

```typescript
claimTask: (teamName: string, taskId: string, agentId?: string): Task => {
  // Check topology enforcement
  const teamConfigPath = getTeamConfigPath(teamName);
  if (fileExists(teamConfigPath)) {
    try {
      const teamConfig = readValidatedJSON(teamConfigPath, TeamConfigSchema);
      if (teamConfig.topology === 'hierarchical') {
        const claimerId = agentId || process.env.OPENCODE_AGENT_ID;
        if (claimerId && claimerId !== teamConfig.leader) {
          // Check if claimer has task-manager role
          const role = getAgentRole(claimerId);
          if (role !== 'leader' && role !== 'task-manager') {
            throw new Error(
              'Hierarchical topology: only leader or task-manager can assign tasks. ' +
              'Request task assignment via message to the leader.'
            );
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('Hierarchical topology')) throw e;
      // Ignore other errors (missing config = flat behavior)
    }
  }

  // ... existing claimTask logic
},
```

2. Import necessary functions: `getTeamConfigPath`, `fileExists`, `readValidatedJSON`,
   `TeamConfigSchema`, `getAgentRole`

**IMPORTANT**: Default behavior (no topology field or topology='flat') must remain unchanged.
Only enforce when topology is explicitly 'hierarchical'.

**Validation**:
- [ ] Flat topology: any agent can claim (existing behavior preserved)
- [ ] Hierarchical: leader can assign tasks
- [ ] Hierarchical: task-manager can assign tasks
- [ ] Hierarchical: worker CANNOT self-assign (gets error)
- [ ] Missing topology field: flat behavior (backward compat)

---

### T023: Add Description Field Support

**Purpose**: Allow teams to have a documentation field.

**Steps**:

1. Update `TeamOperations.spawnTeam` in `src/operations/team.ts` to accept an optional
   config parameter with description and topology:

```typescript
spawnTeam: (
  teamName: string,
  leaderInfo: LeaderInfo = {},
  options?: { description?: string; topology?: TopologyType },
): TeamConfig => {
  // ... existing validation and directory creation ...

  const config: TeamConfig = {
    name: teamName,
    created: now,
    leader: leaderId,
    members: [/* ... existing member creation ... */],
    description: options?.description,
    topology: options?.topology,
  };

  // ... rest of existing logic
},
```

**IMPORTANT**: Adding the optional third parameter to spawnTeam must not break any existing
callers. Check all usages in tools and tests.

**Validation**:
- [ ] spawnTeam without options works as before
- [ ] spawnTeam with description stores it in config
- [ ] spawnTeam with topology stores it in config

---

### T024: Implement TeamOperations.deleteTeam

**Purpose**: Remove a team and all its resources (config, tasks, inboxes).

**Steps**:

1. Add to TeamOperations in `src/operations/team.ts`:

```typescript
deleteTeam: (teamName: string): void => {
  const teamDir = getTeamDir(teamName);
  if (!dirExists(teamDir)) {
    throw new Error(`Team "${teamName}" does not exist`);
  }

  const configPath = getTeamConfigPath(teamName);
  if (!fileExists(configPath)) {
    throw new Error(`Team "${teamName}" has no config file`);
  }

  // Remove team tasks directory
  const tasksDir = getTeamTasksDir(teamName);
  if (dirExists(tasksDir)) {
    rmSync(tasksDir, { recursive: true });
  }

  // Remove team directory (includes config, inboxes)
  rmSync(teamDir, { recursive: true });
},
```

2. `rmSync` is already imported at the top of team.ts

**Validation**:
- [ ] Deletes team directory and contents
- [ ] Deletes team's task directory
- [ ] Throws for non-existent team
- [ ] Deleted team no longer appears in discoverTeams

---

### T025: Write Team Extension Tests

**Purpose**: Test template instantiation, topology enforcement, description, deletion.

**Steps**:

1. Create `tests/team-extensions.test.ts`
2. Test cases:
   - spawnTeamFromTemplate: valid template, creates team with roles/tasks/topology
   - spawnTeamFromTemplate: invalid template name throws
   - Topology enforcement: hierarchical blocks worker self-assign
   - Topology enforcement: flat allows worker self-assign
   - Description field preserved through create/read cycle
   - deleteTeam: removes team and tasks
   - deleteTeam: non-existent team throws
3. Use temp directory isolation

**File**: `tests/team-extensions.test.ts`

**Validation**:
- [ ] All test cases pass
- [ ] `bun test tests/team-extensions.test.ts` succeeds

## Definition of Done

- [ ] spawnTeamFromTemplate implemented and tested
- [ ] Topology enforcement in claimTask
- [ ] Description field support in spawnTeam
- [ ] deleteTeam implemented and tested
- [ ] Full test suite passes (`bun test`)
- [ ] `bun x tsc` compiles
- [ ] No lint errors

## Risks

- **spawnTeam signature change**: Adding optional third param may break callers. Audit all
  callers in tools/index.ts and tests.
- **deleteTeam with active agents**: Should we check for active agents before deleting?
  Current spec says just delete - no check. Document this behavior.

## Reviewer Guidance

- Check backward compat of spawnTeam signature change
- Verify topology enforcement only activates for 'hierarchical', never for undefined/flat
- Check that deleteTeam handles partial state (e.g., team dir exists but no tasks dir)
