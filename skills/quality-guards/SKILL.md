---
name: quality-guards
description: Automated quality enforcement via file naming (ls-lint), markdown linting (markdownlint-cli2), and tiered git hooks
author: opencode-teams
version: 1.0.0
compatibility: opencode
metadata:
  category: quality
  audience: ai-agents
---

# Quality Guards Skill

Enforce file naming conventions, markdown standards, and code quality through automated
tooling and tiered git hooks. This skill describes the project's quality enforcement
system so AI agents can work within it without triggering violations.

## Bun-First Decision Hierarchy

When selecting APIs, packages, or tooling, follow this order:

1. **Bun built-in API** - Check if Bun provides a native solution first
   (`Bun.file()`, `Bun.write()`, `Bun.spawnSync()`, `Bun.serve()`, `bun test`)
2. **Bun-focused package** - Look for packages designed for or optimized for Bun
3. **Node.js / other fallback** - Only when neither Bun-native nor Bun-focused options exist

This hierarchy applies to runtime APIs, testing, package management, and build tooling.

## File Naming Conventions (ls-lint)

All file and directory names are enforced by [ls-lint](https://ls-lint.org/) via the
`.ls-lint.yml` config at the project root.

### Rules

| Scope                 | Extension                                       | Convention                                   |
| --------------------- | ----------------------------------------------- | -------------------------------------------- |
| Global                | directories                                     | `kebab-case`                                 |
| Global                | `.ts`, `.js`, `.json`, `.yml`, `.yaml`, `.toml` | `kebab-case`                                 |
| Global                | `.md`                                           | `UPPERCASE` (e.g., `README.md`, `AGENTS.md`) |
| `tests/`              | `.test.ts`, `.sh`                               | `kebab-case`                                 |
| `examples/`, `tasks/` | `.md`                                           | `kebab-case` (overrides global)              |
| `workflows/`          | `.md`                                           | `kebab-case` or `UPPERCASE`                  |
| `.github/`            | `.yml`, `.yaml`                                 | `kebab-case`                                 |

### What This Means for Agents

- New TypeScript files: always `kebab-case` (e.g., `team-operations.ts`, not `teamOperations.ts`)
- New directories: always `kebab-case` (e.g., `quality-guards/`, not `qualityGuards/`)
- New markdown in `docs/`, `skills/`, `agent/`: `UPPERCASE` (e.g., `SKILL.md`, `INSTALL.md`)
- New markdown in `examples/`, `tasks/`: `kebab-case` (e.g., `code-review.md`)

### Running ls-lint

```bash
# Check naming conventions
bun run ls-lint

# Output: lists violations or exits 0 if clean
```

## Markdown Standards (markdownlint-cli2)

Markdown files are linted by [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)
via `.markdownlint-cli2.jsonc` at the project root.

### Key Rules

| Rule               | Setting           | Notes                                      |
| ------------------ | ----------------- | ------------------------------------------ |
| Heading style      | ATX (`#`) only    | No setext (underline) headings             |
| List style         | Dashes (`-`)      | Not asterisks or plus signs                |
| List indent        | 2 spaces          | Matches Prettier `tabWidth`                |
| Line length        | 100 characters    | Excludes code blocks, tables, headings     |
| First-line heading | Disabled          | Files may use YAML frontmatter             |
| Duplicate headings | Siblings only     | Same heading allowed in different sections |
| Code blocks        | Fenced (backtick) | No indented code blocks                    |
| Emphasis           | Asterisks         | `*italic*` and `**bold**`                  |

### Scoped Files

Only these paths are linted (configured via `globs` in `.markdownlint-cli2.jsonc`):

- `docs/**/*.md`
- `skills/**/*.md`
- `agent/**/*.md`
- `examples/**/*.md`
- `workflows/**/*.md`
- `tasks/**/*.md`
- `README.md`, `CHANGELOG.md`, `RELEASE.md`, `AGENTS.md`

Tool/agent directories (`.kittify/`, `.opencode/`, `.beads/`, etc.) are excluded.

### Running markdownlint

```bash
# Check markdown standards
bun run markdownlint

# Fix auto-fixable issues
bun run markdownlint:fix
```

## Tiered Git Hook Strategy

Quality gates are enforced through [Lefthook](https://github.com/evilmartians/lefthook)
with a two-tier strategy:

### Pre-commit (Progress-Friendly)

Runs on every commit in parallel. Designed to not block progress:

| Check        | Behavior                   | Blocking?                         |
| ------------ | -------------------------- | --------------------------------- |
| ESLint       | Auto-fixes and re-stages   | No (fixes in place)               |
| Prettier     | Auto-formats and re-stages | No (fixes in place)               |
| TypeScript   | Type-check only            | Yes (no `any` in production code) |
| ls-lint      | Check naming conventions   | Yes (must rename files)           |
| markdownlint | Check markdown standards   | No (warn only, blocks push/merge) |

### Pre-push (Strict Gate)

Runs before pushing to remote. All checks are blocking:

| Check        | Behavior               | Blocking? |
| ------------ | ---------------------- | --------- |
| Tests        | Full test suite        | Yes       |
| Build        | TypeScript compilation | Yes       |
| ls-lint      | Naming conventions     | Yes       |
| markdownlint | Markdown standards     | Yes       |

### What This Means for Agents

- **Committing**: You can commit freely. Auto-fixers handle formatting.
  Naming violations and type errors block. Markdown issues warn but don't block -
  fix them before pushing.
- **Pushing**: Everything must be clean. Run the full check suite before pushing:

```bash
# Pre-push verification (run manually before pushing)
bun test && bun run build && bun run ls-lint && bun run markdownlint
```

## Quick Reference

```bash
# Check everything
bun run lint          # ESLint
bun run typecheck     # TypeScript types
bun run ls-lint       # File naming
bun run markdownlint  # Markdown standards
bun test              # Tests
bun run build         # Build

# Fix everything
bun run lint:fix         # ESLint auto-fix
bun run format           # Prettier auto-format
bun run markdownlint:fix # Markdown auto-fix

# Full pre-push check
bun test && bun run build && bun run ls-lint && bun run markdownlint
```

## Related Files

- `.ls-lint.yml` - File naming convention rules
- `.markdownlint-cli2.jsonc` - Markdown linting configuration
- `lefthook.yml` - Git hook configuration
- `eslint.config.js` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `.kittify/memory/constitution.md` - Project constitution (references this skill)
