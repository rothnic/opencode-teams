---
name: quality-guards
description: Automated quality enforcement via file naming (ls-lint), markdown linting (markdownlint-cli2), and tiered git hooks
author: opencode-teams
version: 1.1.0
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

## Config Directory Convention

CLI-only tool configs live in `.config/` to keep the project root clean:

| File                | Location                           | Why                            |
| ------------------- | ---------------------------------- | ------------------------------ |
| ls-lint config      | `.config/ls-lint.yml`              | CLI supports `--config`        |
| markdownlint config | `.config/.markdownlint-cli2.jsonc` | CLI supports `--config`        |
| ESLint config       | `eslint.config.js` (root)          | IDE extensions expect root     |
| Prettier config     | `.prettierrc` (root)               | IDE extensions expect root     |
| TypeScript config   | `tsconfig.json` (root)             | IDE/build tooling expects root |

**Rule**: If a tool's CLI supports `--config` and no IDE extension
requires the file in root, move it to `.config/`.

## File Naming Conventions (ls-lint)

All file and directory names are enforced by [ls-lint](https://ls-lint.org/) via
`.config/ls-lint.yml`.

### Root-File Allowlist

The ls-lint config uses a `.*` wildcard rule so any file extension not
explicitly listed still must follow `kebab-case` naming. This acts as an
allowlist: unexpected files (scratch notes, temp outputs, session dumps)
will fail the check. Keep the root clean - delete stray files rather than
adding them to the ignore list.

### Rules

| Scope                 | Extension                                       | Convention                                   |
| --------------------- | ----------------------------------------------- | -------------------------------------------- |
| Global                | directories                                     | `kebab-case`                                 |
| Global                | `.ts`, `.js`, `.json`, `.yml`, `.yaml`, `.toml` | `kebab-case`                                 |
| Global                | `.md`                                           | `UPPERCASE` (e.g., `README.md`, `AGENTS.md`) |
| Global                | `.*` (catch-all)                                | `kebab-case`                                 |
| `tests/`              | `.test.ts`, `.sh`                               | `kebab-case`                                 |
| `examples/`, `tasks/` | `.md`                                           | `kebab-case` (overrides global)              |
| `workflows/`          | `.md`                                           | `kebab-case` or `UPPERCASE`                  |
| `.github/`            | `.yml`, `.yaml`                                 | `kebab-case`                                 |
| `.config/`            | `.yml`, `.yaml`, `.jsonc`, `.json`              | `kebab-case`                                 |

### What This Means for Agents

- New TypeScript files: always `kebab-case` (e.g., `team-operations.ts`)
- New directories: always `kebab-case` (e.g., `quality-guards/`)
- New markdown in `docs/`, `skills/`, `agent/`: `UPPERCASE` (e.g., `SKILL.md`)
- New markdown in `examples/`, `tasks/`: `kebab-case` (e.g., `code-review.md`)
- **Do not** leave scratch files in the root - they will fail ls-lint

### Running ls-lint

```bash
bun run ls-lint
```

## Markdown Standards (markdownlint-cli2)

Markdown files are linted by
[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2)
via `.config/.markdownlint-cli2.jsonc`.

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

Only these paths are linted (configured via `globs` in the config):

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
bun run markdownlint

bun run markdownlint:fix
```

## Tiered Git Hook Strategy

Quality gates are enforced through [Lefthook](https://github.com/evilmartians/lefthook)
with a two-tier strategy and branch-aware messaging.

### Pre-commit (Progress-Friendly)

Runs on every commit in parallel. Designed to not block progress:

| Check        | Behavior                   | Blocking?                         |
| ------------ | -------------------------- | --------------------------------- |
| ESLint       | Auto-fixes and re-stages   | No (fixes in place)               |
| Prettier     | Auto-formats and re-stages | No (fixes in place)               |
| TypeScript   | Type-check only            | Yes (no `any` in production code) |
| ls-lint      | Check naming conventions   | Yes (must rename files)           |
| markdownlint | Check markdown standards   | No (warn only, blocks push/merge) |

### Branch-Aware Messaging

The markdownlint pre-commit hook detects the current branch and adjusts its tone:

- **On `main`/`master`**: Yellow warning - "Strongly recommend fixing before
  push (push WILL be blocked)."
- **On feature branches**: Cyan info - "These will need fixing before merging
  to main."

Both are non-blocking on commit. Push to any remote always enforces markdownlint.

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
  Naming violations and type errors block. Markdown issues warn but don't
  block - fix them before pushing.
- **Pushing**: Everything must be clean. Run the full check suite before pushing:

```bash
bun test && bun run build && bun run ls-lint && bun run markdownlint
```

## Quick Reference

```bash
bun run lint          # ESLint
bun run typecheck     # TypeScript types
bun run ls-lint       # File naming
bun run markdownlint  # Markdown standards
bun test              # Tests
bun run build         # Build

bun run lint:fix         # ESLint auto-fix
bun run format           # Prettier auto-format
bun run markdownlint:fix # Markdown auto-fix

# Full pre-push check
bun test && bun run build && bun run ls-lint && bun run markdownlint
```

## Related Files

- `.config/ls-lint.yml` - File naming convention rules
- `.config/.markdownlint-cli2.jsonc` - Markdown linting configuration
- `lefthook.yml` - Git hook configuration
- `eslint.config.js` - ESLint configuration
- `.prettierrc` - Prettier configuration
- `.kittify/memory/constitution.md` - Project constitution (references this skill)
