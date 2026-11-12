# Repository instructions

## Read by task

- For setup, commands, test ports, or source ownership, read [docs/development.md](docs/development.md).
- Before changing studio controls, theme tokens, icons, or canvas interactions, read [docs/studio-design-system.md](docs/studio-design-system.md).
- For user workflows, read [docs/use-the-studio.md](docs/use-the-studio.md). For Ember changes, also read [examples/ember/README.md](examples/ember/README.md).
- Before writing Exact Contract, read `.exact-sdk/docs/start-here.md`. Run SDK lookup commands from the app directory, such as `bun exact.mjs contract vocab <name>`.

## Preserve repository boundaries

Use root package scripts for development and checks. They configure the SDK, helper, and test environment. Keep the SDK revision in `tools/setup.mjs` pinned unless the task includes an SDK upgrade.

Keep generated `exact.mjs` files and `exact:begin` instruction blocks intact. Add project guidance outside those blocks. Generate `studio/icons.contract` with `bun run icons` after changing the vendored icon inputs.

Keep drafts separate from source writes. Preserve digest checks and compiler validation for the complete Apply batch. Use source-map identities for editable elements, including shared styles and repeated instances.

Keep workspace and camera state in the existing Contract and model. Browser modules handle browser input and focus without creating a second state model.

## Verify changes

Use the root package scripts to select checks for the changed behavior:

- Model, persistence, source adapter, or service changes: `bun run test`.
- Studio interaction or state changes: `bun run test:ui`.
- Browser input, preview, or app-editing changes: `bun run test:preview`.
- Studio UI or layout changes: `bun run verify` and `bun run build`.
- Ember behavior changes: `bun tools/demo.mjs test web`.
- Documentation-only changes: check local links, command names, and `git diff --check`.

Before `test:ui` or `verify`, check ports 5175 and 5176. If occupied, coordinate stopping the owner or use an isolated environment. Preserve the user's running studio and demo.

Report the checks run, failures, and untested behavior. Attribute a failure to an existing issue only with evidence.

## Maintain documentation

Keep the root README focused on startup and documentation links. Put task instructions in `docs/use-the-studio.md`, development details in `docs/development.md`, and UI conventions in `docs/studio-design-system.md`.

Add notable user-visible changes to `CHANGELOG.md` under Unreleased. Group entries under Added, Changed, or Fixed as needed. At release time, move those entries to the release heading with its actual date and version. Keep historical development dates distinct from releases.
