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

`test:ui` and `verify` run in temporary copies with private ports. Preserve the user's running studio and demo. See `docs/development.md` for verification artifacts and socket-permission failures.

Report the checks run, failures, and untested behavior. Attribute a failure to an existing issue only with evidence.

## Maintain documentation

Keep the root README focused on startup and documentation links. Put task instructions in `docs/use-the-studio.md`, development details in `docs/development.md`, and UI conventions in `docs/studio-design-system.md`.

Add notable user-visible changes to `CHANGELOG.md` under Unreleased. Group entries under Added, Changed, or Fixed as needed. At release time, move those entries to the release heading with its actual date and version. Keep historical development dates distinct from releases.

## Name and describe pull requests

Use `<type>(<scope>): <summary>` for every PR title. Examples:

- `fix(ui): correct inspector field spacing`
- `feat(studio): add viewport presets`
- `docs(repo): simplify setup and contributor guidance`

Use a lowercase type: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, or `chore`. Use a short lowercase scope that names the affected area, such as `ui`, `studio`, `preview`, `ember`, or `repo`. Choose the primary area when a change spans several areas.

Write the summary as an imperative phrase with no trailing period. Describe the resulting change. Keep the full title within 72 characters. For a breaking change, put `!` before the colon and explain the migration in the description.

Use [.github/pull_request_template.md](.github/pull_request_template.md) for the description. Under Summary, state the problem and resulting behavior. Under Screenshots, add before-and-after images for visible changes, taken at the same window size, zoom, and theme, or explain why they are missing. Images must be GitHub attachments in the description or a comment. Keep PR proof captures outside the repository and use attachment URLs, not branch file links. Check `gh pr edit --help` for `--attach`; when available, upload captures with it and verify the resulting URLs. Otherwise use the authenticated browser, or list local paths and mark attachments pending. Intentional README and documentation images may be committed under `docs/images/`. Under Validation, list the checks run and their results, including anything not tested and why. Add a Risks or migration section only when needed. Complete the checklist. End the description with the model and tool that did the work.

The repository has no hosted CI, so local check results in the description are the only verification record. Contributor guidance lives in [CONTRIBUTING.md](CONTRIBUTING.md); keep it consistent with these instructions.

Keep descriptions readable in under a minute. Link related issues and supporting evidence instead of pasting logs. Before requesting review, update the title and description to match the final scope.
