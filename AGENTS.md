- Run `bun prepare` to generate the `app.json` file.
- Always run `bun fix && bun check` to fix and check for errors. All errors must be fixed before committing.

- Each version must have a changelog file in `changelogs/vX.Y.Z.md`.
- Every changelog must follow this exact structure:
  - A title in the format `# vX.Y.Z`
  - One short paragraph describing what changed from the user's perspective
  - One flat bullet list of short, concise, user-visible changes
- Do not use subsections, nested bullets in changelog files, or long implementation details.
- Changelog template:
  ```md
  # vX.Y.Z

  Short paragraph describing what changed from the user's perspective.

  - Added short user-visible change.
  - Improved short user-visible change.
  - Fixed short user-visible change.
  ```
