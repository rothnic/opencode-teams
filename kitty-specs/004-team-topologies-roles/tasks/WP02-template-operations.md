---
work_package_id: WP02
title: Template Operations
lane: planned
dependencies: []
subtasks: [T009, T010, T011, T012, T013, T014, T015]
history:
- date: '2026-02-10'
  action: created
  by: planner
---

# WP02: Template Operations

**Implementation command**: `spec-kitty implement WP02 --base WP01`

## Objective

Create `src/operations/template.ts` with CRUD operations for team templates: save, load,
list, delete, and saveFromTeam. Ship 3 built-in default templates. Follow the same patterns
used in `src/operations/team.ts` (atomic writes, file locking, Zod validation).

## Context

- **Pattern source**: `src/operations/team.ts` - team CRUD with atomic writes and file locking
- **Storage**: Templates stored as JSON in `getProjectTemplatesDir()` (project-local) and
  `getTemplatesDir()` (global). Project-local takes precedence.
- **Schemas**: TeamTemplateSchema from WP01 (src/types/schemas.ts)
- **Utilities**: `readValidatedJSON`, `writeAtomicJSON`, `lockedUpdate` from `src/utils/fs-atomic.ts`
- **Locking**: `withLock` from `src/utils/file-lock.ts`
- **File ops**: Use existing `fileExists`, `dirExists`, `ensureDir` from storage-paths.ts

## Subtasks

### T009: Create TemplateOperations.save

**Purpose**: Save a template to disk with validation and atomic write.

**Steps**:

1. Create `src/operations/template.ts`
2. Implement save function:

```typescript
import { join } from 'node:path';
import { readdirSync } from 'node:fs';
import { TeamTemplateSchema, type TeamTemplate } from '../types/schemas';
import { readValidatedJSON, writeAtomicJSON } from '../utils/fs-atomic';
import {
  getProjectTemplatesDir,
  getTemplatePath,
  getTemplatesDir,
  fileExists,
} from '../utils/storage-paths';

export const TemplateOperations = {
  save: (template: TeamTemplate): TeamTemplate => {
    // Validate through schema
    const validated = TeamTemplateSchema.parse(template);
    const filePath = getTemplatePath(validated.name);
    writeAtomicJSON(filePath, validated);
    return validated;
  },
  // ... more operations below
};
```

**Validation**:
- [ ] Valid template saves to correct path
- [ ] Invalid template (missing roles) throws validation error
- [ ] Overwriting existing template works (upsert behavior)

---

### T010: Create TemplateOperations.load

**Purpose**: Load and validate a template from disk.

**Steps**:

1. Look in project-local first, then global templates dir
2. Validate via TeamTemplateSchema on read

```typescript
load: (templateName: string): TeamTemplate => {
  // Check project-local first
  const projectPath = getTemplatePath(templateName);
  if (fileExists(projectPath)) {
    return readValidatedJSON(projectPath, TeamTemplateSchema);
  }
  // Fall back to global templates
  const globalPath = join(getTemplatesDir(), `${templateName}.json`);
  if (fileExists(globalPath)) {
    return readValidatedJSON(globalPath, TeamTemplateSchema);
  }
  throw new Error(`Template "${templateName}" not found`);
},
```

**Validation**:
- [ ] Loads project-local template when it exists
- [ ] Falls back to global template
- [ ] Throws descriptive error for missing template
- [ ] Validates schema on load (corrupt file detected)

---

### T011: Create TemplateOperations.list

**Purpose**: List all available templates (project + global, deduplicated).

**Steps**:

1. Read both directories, parse filenames, deduplicate (project wins)
2. Return array of template summaries (name + description)

```typescript
list: (): Array<{ name: string; description?: string; source: 'project' | 'global' }> => {
  const results = new Map<string, { name: string; description?: string; source: 'project' | 'global' }>();

  // Global templates first (will be overridden by project)
  const globalDir = getTemplatesDir();
  for (const file of safeReadDir(globalDir)) {
    if (file.endsWith('.json')) {
      const name = file.replace('.json', '');
      try {
        const template = readValidatedJSON(join(globalDir, file), TeamTemplateSchema);
        results.set(name, { name, description: template.description, source: 'global' });
      } catch { /* skip invalid */ }
    }
  }

  // Project templates override global
  const projectDir = getProjectTemplatesDir();
  for (const file of safeReadDir(projectDir)) {
    if (file.endsWith('.json')) {
      const name = file.replace('.json', '');
      try {
        const template = readValidatedJSON(join(projectDir, file), TeamTemplateSchema);
        results.set(name, { name, description: template.description, source: 'project' });
      } catch { /* skip invalid */ }
    }
  }

  return Array.from(results.values());
},
```

Add a helper `safeReadDir` that returns `[]` if directory doesn't exist.

**Validation**:
- [ ] Lists templates from both directories
- [ ] Project templates override global with same name
- [ ] Empty directories return empty array
- [ ] Invalid JSON files are skipped silently

---

### T012: Create TemplateOperations.delete

**Purpose**: Delete a project-local template.

**Steps**:

1. Only allow deleting project-local templates (not global/built-in)
2. Use `unlinkSync` after checking existence

```typescript
delete: (templateName: string): void => {
  const filePath = getTemplatePath(templateName);
  if (!fileExists(filePath)) {
    throw new Error(`Template "${templateName}" not found in project templates`);
  }
  unlinkSync(filePath);
},
```

**Validation**:
- [ ] Deletes existing project template
- [ ] Throws for non-existent template
- [ ] Cannot delete global templates

---

### T013: Create TemplateOperations.saveFromTeam

**Purpose**: Extract a template from a running team's configuration.

**Steps**:

1. Read team config, extract roles/topology/workflow config
2. Create a TeamTemplate from the extracted data

```typescript
saveFromTeam: (
  templateName: string,
  teamName: string,
  options?: { description?: string },
): TeamTemplate => {
  const configPath = getTeamConfigPath(teamName);
  const teamConfig = readValidatedJSON(configPath, TeamConfigSchema);

  const template: TeamTemplate = {
    name: templateName,
    description: options?.description || `Extracted from team "${teamName}"`,
    topology: teamConfig.topology || 'flat',
    roles: teamConfig.roles || [{ name: 'worker' }],
    workflowConfig: teamConfig.workflowConfig,
    createdAt: new Date().toISOString(),
  };

  return TemplateOperations.save(template);
},
```

**Validation**:
- [ ] Extracts template from team with roles
- [ ] Handles team without roles (default worker role)
- [ ] Throws for non-existent team

---

### T014: Add Built-in Default Templates

**Purpose**: Ship 3 default templates: code-review, leader-workers, swarm.

**Steps**:

1. Create a `getBuiltinTemplates()` function that returns the 3 templates
2. Optionally install them to global templates dir on first run

```typescript
export function getBuiltinTemplates(): TeamTemplate[] {
  const now = new Date().toISOString();
  return [
    {
      name: 'code-review',
      description: 'Parallel code review with specialized reviewers',
      topology: 'flat',
      roles: [
        { name: 'leader', deniedTools: ['claim-task'] },
        { name: 'reviewer', allowedTools: ['update-task', 'send-message', 'poll-inbox', 'heartbeat'] },
      ],
      defaultTasks: [
        { title: 'Security Review', priority: 'high' },
        { title: 'Performance Review', priority: 'normal' },
        { title: 'Style Review', priority: 'normal' },
      ],
      createdAt: now,
    },
    {
      name: 'leader-workers',
      description: 'Hierarchical team with leader directing workers',
      topology: 'hierarchical',
      roles: [
        { name: 'leader', deniedTools: ['claim-task'] },
        { name: 'worker', deniedTools: ['spawn-team', 'kill-agent', 'delete-team'] },
      ],
      workflowConfig: { enabled: true, taskThreshold: 5, workerRatio: 3.0, cooldownSeconds: 300 },
      createdAt: now,
    },
    {
      name: 'swarm',
      description: 'Flat topology where workers self-assign from shared queue',
      topology: 'flat',
      roles: [
        { name: 'worker', deniedTools: ['spawn-team', 'kill-agent', 'delete-team'] },
      ],
      createdAt: now,
    },
  ];
}
```

**Validation**:
- [ ] All 3 templates pass TeamTemplateSchema validation
- [ ] code-review template has 3 default tasks
- [ ] leader-workers has workflowConfig enabled
- [ ] swarm has flat topology

---

### T015: Write Template Operations Tests

**Purpose**: Comprehensive tests for all template CRUD operations.

**Steps**:

1. Create `tests/template-operations.test.ts`
2. Use temp directory for test isolation (following existing test patterns)
3. Set `OPENCODE_PROJECT_ROOT` env var to temp dir for isolation
4. Test all operations: save, load, list, delete, saveFromTeam, builtins
5. Test error cases: invalid template, missing template, duplicate names

**File**: `tests/template-operations.test.ts`

**Validation**:
- [ ] All CRUD operations tested
- [ ] Error cases covered
- [ ] Built-in templates validated
- [ ] Tests pass with `bun test tests/template-operations.test.ts`

## Definition of Done

- [ ] `src/operations/template.ts` created with all operations
- [ ] Built-in templates defined and validated
- [ ] Template operations exported from `src/operations/index.ts`
- [ ] All tests pass
- [ ] `bun x tsc` compiles
- [ ] No lint errors

## Risks

- Storage path precedence (project vs global) must be consistent across save/load/list
- Built-in templates must match TeamTemplateSchema exactly (run through parse)

## Reviewer Guidance

- Verify atomic writes are used for save operations
- Check project-local vs global template precedence is consistent
- Ensure no `fs` imports that bypass the existing utility functions
