- Run `bun prepare` to generate the `app.json` file.
- Always run `bun fix && bun check` to fix and check for errors. All errors must be fixed before committing.
- For files exporting a class extending Homey, use the `.mts` extension.

- Tests must never import `.ts` files directly, wrappers are NOT allowed.
- Tests must run through `.mts` files only (exclude `app.mts`).

- Branches with name `release/X.Y.Z` should merge to `main`.
- All other branches should merge to the latest `release/X.Y.Z`-branch.

- Store release notes in `.homeychangelog.json`.
- Each version must have a single-line entry keyed by `X.Y.Z`.
- Keep changelog text concise, user-visible, and limited to a single sentence.
