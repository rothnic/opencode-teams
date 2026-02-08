# Development Guide

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.3.2
- [mise](https://mise.jdx.dev/) (recommended for task running)
- [Node.js](https://nodejs.org) >= 20 (for npm compatibility)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/rothnic/opencode-teams.git
cd opencode-teams

# Install dependencies
bun install

# Run setup (includes git hook installation)
mise run setup

# Build the project
mise run build
```

## Development Workflow

### Using mise (Recommended)

mise provides consistent task running across environments:

```bash
mise run setup      # Initial setup
mise run build      # Build TypeScript
mise run test       # Run tests with Bun
mise run lint       # Lint code
mise run lint:fix   # Auto-fix linting issues
mise run format     # Format code with Prettier
mise run typecheck  # Type check without emitting
mise run watch      # Watch mode for development
```

### Using Bun Directly

```bash
bun install         # Install dependencies
bun test            # Run tests
bun test --watch    # Watch mode for tests
bun run build       # Build (via mise)
```

### Using npm Scripts

```bash
npm run setup       # Setup project
npm run build       # Build
npm test            # Test
npm run lint        # Lint
npm run lint:fix    # Fix lint issues
npm run format      # Format code
npm run typecheck   # Type check
```

## Project Structure

```
opencode-teams/
├── src/
│   ├── types/              # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/              # Utility functions (Bun APIs)
│   │   └── index.ts
│   ├── operations/         # Core operations
│   │   ├── team.ts         # Team coordination
│   │   └── task.ts         # Task management
│   ├── index.ts            # Main entry point
│   └── version.ts          # Version info
├── tests/                  # Unit and integration tests
│   ├── utils.test.ts
│   ├── team-operations.test.ts
│   ├── task-operations.test.ts
│   └── integration.sh
├── dist/                   # Built output (generated, not committed)
├── docs/                   # Documentation
├── agent/                  # Agent templates
├── skills/                 # Skill definitions
├── examples/               # Example workflows
├── .mise/                  # mise task definitions
│   └── tasks/
└── .github/                # GitHub workflows
    └── workflows/
```

## Testing

### Unit Tests

Unit tests use Bun's built-in test runner:

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/team-operations.test.ts

# Run tests in watch mode
bun test --watch

# Run tests with coverage (if configured)
bun test --coverage
```

### Integration Tests

The integration test verifies the plugin works with OpenCode:

```bash
./tests/integration.sh
```

### Writing Tests

Tests use Bun's native test framework:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';

describe('MyFeature', () => {
  beforeAll(() => {
    // Setup
  });

  it('should do something', () => {
    expect(true).toBe(true);
  });

  afterAll(() => {
    // Cleanup
  });
});
```

## Code Quality

### Git Hooks (Lefthook)

Git hooks are automatically installed via `mise run setup` or `npm run setup`:

**Pre-commit hooks:**

- Linting (auto-fix enabled)
- Formatting (auto-fix enabled)
- Type checking

**Pre-push hooks:**

- Run all tests
- Build verification

To manually run hooks:

```bash
# Install hooks
npx lefthook install

# Run pre-commit hooks
npx lefthook run pre-commit

# Run pre-push hooks
npx lefthook run pre-push
```

### Linting

ESLint with Prettier integration:

```bash
# Check for lint issues
mise run lint

# Auto-fix lint issues
mise run lint:fix
```

### Formatting

Prettier for consistent code formatting:

```bash
# Format code
mise run format

# Check formatting without fixing
npx prettier --check .
```

### Type Checking

TypeScript strict mode enabled:

```bash
# Type check
mise run typecheck

# Type check with watch mode
npx tsc --watch --noEmit
```

## Building

### Development Build

```bash
mise run build
```

This compiles TypeScript from `src/` to JavaScript in `dist/` with:

- Source maps
- Declaration files (.d.ts)
- Declaration maps

### Production Build

The same build command is used for production. The build output is optimized by TypeScript compiler settings in `tsconfig.json`.

## Bun Best Practices

### Using Bun APIs

This project uses Bun's native APIs for optimal performance:

```typescript
// File operations
const file = Bun.file('path/to/file');
await file.json(); // Read JSON
await Bun.write('path/to/file', data); // Write file

// Process spawning
Bun.spawnSync(['command', 'arg1', 'arg2']);

// Crypto
globalThis.crypto.getRandomValues(new Uint8Array(16));
```

### Bun vs Node.js

Prefer Bun APIs over Node.js equivalents:

- ✅ `Bun.file()` instead of `fs.readFileSync()`
- ✅ `Bun.write()` instead of `fs.writeFileSync()`
- ✅ `Bun.spawnSync()` instead of `child_process.execSync()`
- ✅ `globalThis.crypto` instead of `require('crypto')`

### Lockfile Management

This project uses `bun.lockb` (Bun's binary lockfile):

```bash
# Generate/update lockfile
bun install

# Install from lockfile (CI)
bun install --frozen-lockfile
```

**Note**: `bun.lockb` is committed to the repository for reproducible builds.

## Release Process

Releases are automated via release-please:

1. Make changes following [Conventional Commits](https://www.conventionalcommits.org/)
2. Push to `main` branch
3. release-please creates/updates a release PR
4. Merge the release PR to trigger:
   - Version bump
   - CHANGELOG update
   - GitHub release
   - npm publish (if configured)

### Commit Message Format

```
type(scope): subject

body

footer
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

```
feat: add message filtering to readMessages
fix: handle race condition in claimTask
docs: update installation instructions
```

## Troubleshooting

### Bun not found

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

### mise not found

Install mise:

```bash
curl https://mise.jdx.dev/install.sh | sh
```

### Git hooks not working

Reinstall hooks:

```bash
npx lefthook install
```

### Build failures

1. Clean and rebuild:

```bash
rm -rf dist node_modules
bun install
mise run build
```

2. Check TypeScript errors:

```bash
mise run typecheck
```

### Test failures

1. Run tests with verbose output:

```bash
bun test --verbose
```

2. Run specific failing test:

```bash
bun test tests/specific-test.test.ts
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## Resources

- [Bun Documentation](https://bun.sh/docs)
- [mise Documentation](https://mise.jdx.dev/)
- [Lefthook Documentation](https://github.com/evilmartians/lefthook/blob/master/docs/usage.md)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Conventional Commits](https://www.conventionalcommits.org/)
