- NEVER push directly to `main` or `release/*` branches.

- AWLAYS use the [/homey](.agents/skills/homey/SKILL.md) skill.
- Always run `bun check` and `bun test` after changes to check for errors
  - Run `bun fix` to auto-fix errors from `bun check`. All errors must be fixed before committing.
- For files exporting a class extending Homey, use the `.mts` extension.
- App logic should be in the `/src` folder.
- Tests should be in the `/tests` folder.

- Tests must never import `.ts` files directly, wrappers are NOT allowed.
- Tests must run through `.mts` files only (exclude `app.mts`).

- Branches with name `release/X.Y.Z` should merge to `main`.
- All other branches should merge to the latest `release/X.Y.Z`-branch.

- Store release notes in `.homeychangelog.json`.
- Each version must have a single-line entry keyed by `X.Y.Z`.
- Keep changelog text concise, user-visible, and limited to a single sentence.

## Cursor Cloud specific instructions

- **Runtime**: Bun (installed via `curl -fsSL https://bun.sh/install | bash`). After install, ensure `~/.bun/bin` is on `PATH`.
- **Node.js 22** is also required and available via nvm.
- **Key commands** (all from repo root):
  - `bun install` — install dependencies
  - `bun run build` — TypeScript compilation (`tsc`)
  - `bun run check` — full validation (Homey app validate + ESLint + Prettier + tsc --noEmit + knip)
  - `bun run fix` — auto-fix lint/format/dead-code issues
  - `bun test` — run tests with coverage (uses `bun:test`)
- **`bun run dev`** requires a physical Homey device and prior `bunx homey login` / `bunx homey select`; it cannot run in CI or headless cloud environments.
- The `punycode` deprecation warning from `homey app validate` is harmless and expected.
- Coverage thresholds are configured in `bunfig.toml` (90% lines, 60% functions, 90% statements).
