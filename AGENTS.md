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
- After each change, reflect the change in the latest changelog entry.
