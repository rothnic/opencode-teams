# Agent Development Guide

**This file is for developers/AI agents working ON this plugin codebase.**

For documentation on how AI agents USE this plugin's features (teams, coordination), see the [skills/](skills/) directory.

## Project Overview

**Type**: OpenCode plugin for multi-agent team coordination  
**Runtime**: Bun (ES Module)  
**Language**: TypeScript (strict mode)  
**Purpose**: Provide custom tools for AI agents to coordinate via teams and shared task queues

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
│   ├── tools/          # OpenCode tool definitions
│   ├── index.ts        # Plugin entry point
│   └── version.ts      # Version info
├── tests/              # Unit & integration tests
├── docs/               # User documentation
├── agent/              # Agent role templates
├── skills/             # Skill definitions (for OpenCode AI agents)
├── examples/           # Example workflows
├── dist/               # Built output (generated)
└── AGENTS.md           # This file
```

## Plugin Architecture

This is an **OpenCode plugin** that:

1. **Registers custom tools** - Using `tool()` helper from OpenCode SDK
2. **Provides skills** - Skill files describe how AI agents use the tools
3. **Defines agent templates** - Pre-configured agent roles (leader, worker, reviewer)
4. **Hooks into OpenCode lifecycle** - Responds to session and tool events

### Key Files

- **opencode.json**: Defines plugin entry point (`./dist/index.js`)
- **src/index.ts**: Main export that registers tools with OpenCode
- **src/tools/**: Tool definitions using OpenCode's tool() helper
- **skills/**: Markdown files with YAML frontmatter describing tools for AI agents
- **agent/**: Markdown files with YAML frontmatter defining agent roles

### Tool Registration Pattern

Tools should be defined using OpenCode's standard pattern:

```typescript
import { tool } from '@opencode/sdk'; // or similar
import { z } from 'zod';

export const spawnTeam = tool({
  description: 'Create a new team of AI agents',
  args: {
    teamName: z.string().describe('Unique name for the team'),
    leaderInfo: z
      .object({
        agentId: z.string().optional(),
        agentName: z.string().optional(),
      })
      .optional(),
  },
  async execute({ teamName, leaderInfo }, context) {
    // Implementation using operations modules
    return TeamOperations.spawnTeam(teamName, leaderInfo);
  },
});
```

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

### Adding a New Tool

1. Create tool in `src/tools/myTool.ts` using `tool()` helper
2. Export from `src/tools/index.ts`
3. Import and register in `src/index.ts`
4. Create/update skill documentation in `skills/*/SKILL.md`
5. Add tests in `tests/`
6. Build and verify: `mise run build && bun test`

### Adding a New Skill

1. Create directory: `skills/skill-name/`
2. Create `SKILL.md` with YAML frontmatter
3. Document what the skill does and when to use it
4. Reference the tools that skill uses

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
- [OpenCode Custom Tools](https://opencode.ai/docs/custom-tools/)
- [OpenCode Skills](https://opencode.ai/docs/skills/)
- [Development Guide](docs/DEVELOPMENT.md)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
