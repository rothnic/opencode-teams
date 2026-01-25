# Agent Development Guide

This file provides guidelines for AI agents (like Copilot) working on this codebase.

## Project Overview

**Type**: OpenCode plugin for multi-agent team coordination  
**Runtime**: Bun (ES Module)  
**Language**: TypeScript (strict mode)  
**Purpose**: Enable AI agents to coordinate work through teams and shared task queues

## Build & Test Commands

- **Setup**: `mise run setup` - Install dependencies and git hooks
- **Build**: `mise run build` - Compile TypeScript to dist/
- **Test**: `bun test` - Run unit tests with Bun
- **Test (single)**: `bun test tests/specific.test.ts`
- **Test (watch)**: `bun test --watch`
- **Lint**: `mise run lint` - Check code style
- **Lint (fix)**: `mise run lint:fix` - Auto-fix issues
- **Format**: `mise run format` - Format with Prettier
- **Type Check**: `mise run typecheck` - Verify types

## Code Style Guidelines

### Module System & Imports

- **ES Modules**: Use `import`/`export` (type: "module")
- **Import order**: External libraries first, then internal modules
- **No .ts extensions in imports**: TypeScript handles this

Example:
```typescript
import { join } from 'node:path';
import type { TeamConfig } from '../types/index';
import { getTeamsDir } from '../utils/index';
```

### Formatting (Prettier)

- **Single quotes**: Yes (`singleQuote: true`)
- **Line width**: 100 characters
- **Tab width**: 2 spaces
- **Semicolons**: Required
- **Trailing commas**: ES5 style

### TypeScript Standards

- **Strict mode**: Enabled (`"strict": true`)
- **Naming conventions**:
  - Types/Interfaces: PascalCase (`TeamConfig`, `TaskOperations`)
  - Functions/variables: camelCase (`spawnTeam`, `taskId`)
  - Constants: UPPER_SNAKE_CASE for true constants
- **Explicit types**: Prefer explicit annotations for function parameters and returns
- **Avoid `any`**: Use proper types; `any` triggers warnings
- **Early returns**: Avoid deep nesting (NeverNesters principle)

### Bun-Specific Patterns

Prefer Bun APIs over Node.js equivalents:

```typescript
// ✅ Preferred (Bun)
const file = Bun.file('path/to/file');
await file.json();
await Bun.write('path', data);
Bun.spawnSync(['command', 'arg']);

// ❌ Avoid (Node.js)
const fs = require('fs');
fs.readFileSync('path');
fs.writeFileSync('path', data);
```

### Error Handling

Always check error types:

```typescript
try {
  // operation
} catch (error: any) {
  // Check type before using error properties
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Operation failed: ${message}`);
}
```

## Testing

- **Framework**: Bun's built-in test runner
- **Style**: Descriptive nested `describe` blocks with `it` tests
- **Assertions**: Use `expect()` from `bun:test`
- **Setup/Teardown**: Use `beforeAll`, `afterAll`, `beforeEach`, `afterEach`

Example:
```typescript
import { describe, it, expect, beforeAll } from 'bun:test';

describe('Feature Name', () => {
  beforeAll(() => {
    // Setup
  });

  it('should do something', () => {
    expect(result).toBe(expected);
  });
});
```

## Project Structure

```
opencode-teams/
├── src/
│   ├── types/          # TypeScript interfaces
│   ├── utils/          # Utility functions (Bun APIs)
│   ├── operations/     # Team and Task operations
│   ├── index.ts        # Plugin entry point
│   └── version.ts      # Version info
├── tests/              # Unit & integration tests
├── docs/               # User documentation
├── agent/              # Agent templates (for OpenCode)
├── skills/             # Skill definitions (for OpenCode)
├── examples/           # Example workflows
├── dist/               # Built output (generated)
└── AGENTS.md           # This file
```

## Plugin Architecture

This is an **OpenCode plugin** that:

1. **Exports operations globally** - Makes TeamOperations and TaskOperations available via `global` object
2. **Provides skills** - Skill files describe how AI agents use the operations
3. **Defines agent templates** - Pre-configured agent roles (leader, worker, reviewer)
4. **Hooks into OpenCode lifecycle** - Responds to session and tool events

### Key Files

- **opencode.json**: Defines plugin entry point (`./dist/index.js`)
- **src/index.ts**: Main export that initializes plugin and sets up global operations
- **skills/**: Markdown files with YAML frontmatter describing available operations
- **agent/**: Markdown files with YAML frontmatter defining agent roles

## Development Workflow

1. Make changes to TypeScript files in `src/`
2. Run `mise run build` to compile
3. Run `bun test` to verify tests pass
4. Run `mise run lint:fix` to auto-fix style issues
5. Commit with conventional commit format: `feat:`, `fix:`, `docs:`, etc.

## Git Hooks (Lefthook)

Automatically runs on git operations:

- **pre-commit**: Lint, format, type-check (auto-fixes staged files)
- **pre-push**: Run tests and build

## Common Tasks

### Adding a New Operation

1. Add function to `src/operations/team.ts` or `task.ts`
2. Export from `src/index.ts` if needed for external use
3. Update skill documentation in `skills/*/SKILL.md`
4. Add tests in `tests/`
5. Build and verify: `mise run build && bun test`

### Adding a New Skill

1. Create directory: `skills/skill-name/`
2. Create `SKILL.md` with YAML frontmatter
3. Document how AI agents use the operations
4. Reference global operations: `global.TeamOperations.methodName()`

### Updating Documentation

- User docs → `docs/` folder
- Agent dev docs → `AGENTS.md` (this file)
- Examples → `examples/` folder
- Skills → `skills/*/SKILL.md`

## Troubleshooting

### Build Failures

```bash
# Clean and rebuild
rm -rf dist node_modules
bun install
mise run build
```

### Test Failures

```bash
# Run with verbose output
bun test --verbose

# Run specific test
bun test tests/failing-test.test.ts
```

### Linting Issues

```bash
# Auto-fix most issues
mise run lint:fix

# Check what can't be auto-fixed
mise run lint
```

## Resources

- [Bun Documentation](https://bun.sh/docs)
- [OpenCode Documentation](https://opencode.ai/docs/)
- [Development Guide](docs/DEVELOPMENT.md)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
