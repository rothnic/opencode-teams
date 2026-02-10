---
work_package_id: "WP01"
title: "Schema Extensions"
lane: "planned"
dependencies: []
subtasks: ["T001", "T002", "T003", "T004", "T005", "T006", "T007", "T008"]
history:
  - date: "2026-02-10"
    action: "created"
    by: "planner"
---

# WP01: Schema Extensions

**Implementation command**: `spec-kitty implement WP01`

## Objective

Add Zod schemas for TopologyType, RoleDefinition, WorkflowConfig, and TeamTemplate to
`src/types/schemas.ts`. Extend the existing TeamConfigSchema with optional topology/role
fields and add 'task-manager' to the AgentState role enum. Add template storage path helpers.

## Context

- **Existing schemas**: `src/types/schemas.ts` (325 lines) defines TeamConfig, Task, AgentState, etc.
- **Pattern**: All schemas use Zod with explicit type inference via `z.infer<typeof Schema>`
- **Storage paths**: `src/utils/storage-paths.ts` already has `getTemplatesDir()` (line 234) pointing to global config
- **Re-exports**: `src/types/index.ts` re-exports everything from schemas.ts
- **Backward compat**: New fields on TeamConfig MUST be `.optional()` or have `.default()`

## Subtasks

### T001: Add TopologyType Enum Schema

**Purpose**: Define the coordination structure enum.

**Steps**:

1. Add after the `TeamSummarySchema` section (~line 134) in `src/types/schemas.ts`:

```typescript
// --- Topology Type ---
export const TopologyTypeSchema = z.enum(['flat', 'hierarchical']);
export type TopologyType = z.infer<typeof TopologyTypeSchema>;
```

**Validation**:
- [ ] `TopologyTypeSchema.parse('flat')` succeeds
- [ ] `TopologyTypeSchema.parse('hierarchical')` succeeds
- [ ] `TopologyTypeSchema.parse('invalid')` throws ZodError

---

### T002: Add RoleDefinition Schema

**Purpose**: Define roles with tool permissions.

**Steps**:

1. Add after TopologyType in `src/types/schemas.ts`:

```typescript
// --- Role Definition ---
export const RoleDefinitionSchema = z.object({
  name: z.string().min(1, 'Role name must be non-empty'),
  allowedTools: z.array(z.string()).optional(),
  deniedTools: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type RoleDefinition = z.infer<typeof RoleDefinitionSchema>;
```

**Validation**:
- [ ] Minimal role `{ name: 'worker' }` parses successfully
- [ ] Full role with allowedTools and deniedTools parses
- [ ] Empty name rejected

---

### T003: Add WorkflowConfig Schema

**Purpose**: Configuration for conditional workflow suggestions.

**Steps**:

1. Add after RoleDefinition in `src/types/schemas.ts`:

```typescript
// --- Workflow Config ---
export const WorkflowConfigSchema = z.object({
  enabled: z.boolean().default(false),
  taskThreshold: z.number().int().positive().default(5),
  workerRatio: z.number().positive().default(3.0),
  cooldownSeconds: z.number().int().nonnegative().default(300),
  lastSuggestionAt: z.string().datetime().optional(),
});
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
```

**Validation**:
- [ ] Empty object `{}` parses with all defaults applied
- [ ] Custom values override defaults
- [ ] Negative taskThreshold rejected

---

### T004: Add TeamTemplate Schema

**Purpose**: Blueprint for reusable team configurations.

**Steps**:

1. Add after WorkflowConfig in `src/types/schemas.ts`:

```typescript
// --- Team Template ---
export const TeamTemplateSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Template name must be kebab-case'),
  description: z.string().optional(),
  topology: TopologyTypeSchema.default('flat'),
  roles: z.array(RoleDefinitionSchema).min(1, 'Template must define at least one role'),
  defaultTasks: z.array(TaskCreateInputSchema).optional(),
  workflowConfig: WorkflowConfigSchema.optional(),
  createdAt: z.string().datetime({ message: 'createdAt must be ISO 8601' }),
  updatedAt: z.string().datetime().optional(),
});
export type TeamTemplate = z.infer<typeof TeamTemplateSchema>;
```

**Dependencies**: Requires T001 (TopologyType), T002 (RoleDefinition), T003 (WorkflowConfig).
Also references existing `TaskCreateInputSchema` (line 65).

**Validation**:
- [ ] Valid template with roles parses
- [ ] Template with no roles rejected (min: 1)
- [ ] Non-kebab-case name rejected
- [ ] defaultTasks uses existing TaskCreateInput format

---

### T005: Extend TeamConfigSchema with Optional Fields

**Purpose**: Add topology, description, template source, roles, and workflow config to teams.

**Steps**:

1. Add new optional fields to TeamConfigSchema (line 24-33) in `src/types/schemas.ts`:

```typescript
export const TeamConfigSchema = z.object({
  name: z.string().min(1, 'Team name must be non-empty')
    .regex(/^[A-Za-z0-9_-]+$/, 'Team name must be alphanumeric with hyphens/underscores'),
  created: z.string().datetime({ message: 'created must be ISO 8601' }),
  leader: z.string().min(1, 'leader must be non-empty'),
  members: z.array(TeamMemberSchema).min(1, 'Team must have at least one member'),
  shutdownApprovals: z.array(z.string()).optional(),
  // New fields (all optional for backward compat)
  topology: TopologyTypeSchema.optional(),
  description: z.string().optional(),
  templateSource: z.string().optional(),
  roles: z.array(RoleDefinitionSchema).optional(),
  workflowConfig: WorkflowConfigSchema.optional(),
});
```

**CRITICAL**: TopologyTypeSchema, RoleDefinitionSchema, and WorkflowConfigSchema must be
defined BEFORE TeamConfigSchema in the file. This means either:
- Move the new schemas above TeamConfigSchema, OR
- Reorder the file so all referenced schemas come first

The safest approach is to insert the new schemas BEFORE the TeamConfig section.

**Validation**:
- [ ] Existing TeamConfig without new fields still parses (backward compat!)
- [ ] TeamConfig with topology: 'hierarchical' parses
- [ ] TeamConfig with description parses
- [ ] TeamConfig with roles array parses

---

### T006: Extend AgentState Role Enum

**Purpose**: Add 'task-manager' role option.

**Steps**:

1. Update the role field in AgentStateSchema (line 175):

```typescript
role: z.enum(['leader', 'worker', 'reviewer', 'task-manager']).default('worker'),
```

**Validation**:
- [ ] Existing roles ('leader', 'worker', 'reviewer') still parse
- [ ] New role 'task-manager' parses
- [ ] Default remains 'worker'

---

### T007: Add Project-Level Template Storage Paths

**Purpose**: Add helpers for project-local template storage alongside existing global templates.

**Steps**:

1. `getTemplatesDir()` already exists at line 234 for global templates
2. Add a project-level templates function to `src/utils/storage-paths.ts`:

```typescript
/**
 * Get the project-local templates directory.
 * <project-root>/.opencode/opencode-teams/templates/
 */
export function getProjectTemplatesDir(projectRoot?: string): string {
  const dir = join(getProjectStorageDir(projectRoot), 'templates');
  ensureDir(dir);
  return dir;
}

/**
 * Get a specific template file path (project-local).
 */
export function getTemplatePath(templateName: string, projectRoot?: string): string {
  return join(getProjectTemplatesDir(projectRoot), `${templateName}.json`);
}
```

3. Update `src/types/index.ts` to re-export all new types.

**Validation**:
- [ ] getProjectTemplatesDir returns correct path
- [ ] getTemplatePath returns correct .json file path

---

### T008: Write Schema Unit Tests

**Purpose**: Validate all new schemas with positive and negative test cases.

**Steps**:

1. Create `tests/schema-extensions.test.ts` following existing test patterns
2. Test each new schema:
   - TopologyType: valid values, invalid values
   - RoleDefinition: minimal, full, invalid (empty name)
   - WorkflowConfig: defaults, custom values, invalid (negative threshold)
   - TeamTemplate: valid, missing roles, invalid name format
   - Extended TeamConfig: backward compat (old format), with new fields
   - Extended AgentState: task-manager role
3. Use `describe` / `it` blocks with `expect` from `bun:test`

**File**: `tests/schema-extensions.test.ts`

**Validation**:
- [ ] All tests pass with `bun test tests/schema-extensions.test.ts`
- [ ] Backward compatibility confirmed for existing TeamConfig and AgentState

## Definition of Done

- [ ] All new schemas added to `src/types/schemas.ts`
- [ ] TeamConfigSchema extended with optional fields
- [ ] AgentState role enum includes 'task-manager'
- [ ] Storage path helpers added for project templates
- [ ] Types re-exported from `src/types/index.ts`
- [ ] Schema tests pass
- [ ] `bun test` (full suite) passes
- [ ] `bun x tsc` compiles without errors
- [ ] No lint errors

## Risks

- **Schema ordering**: TeamTemplate references RoleDefinition and TopologyType. Ensure
  definition order in the file is correct (dependencies first).
- **Backward compat**: If TeamConfigSchema reorder breaks existing TeamConfig parsing,
  all team operations will fail. Test with existing team config files.

## Reviewer Guidance

- Verify backward compatibility: parse an old TeamConfig JSON without new fields
- Check that defaults are sensible (topology: undefined means flat behavior)
- Ensure no `as any` or type suppression
