# Contributing

Thanks for your interest in Exact Design. The project is early, and its direction is still taking shape, so I'm building most of it myself for now. As it settles, I'd like to work more closely with regular contributors.

## What to send

- **Bug fixes.** Small fixes for obvious bugs can go straight to a pull request. For larger ones, link the issue that shows the bug.
- **Performance improvements.** Very welcome. Include before and after measurements; see [Performance changes](#performance-changes).
- **Documentation fixes.**
- **Anything else**, such as a new feature, a UI change, or a refactor: open an issue first so we can talk it through. Unplanned pull requests of this kind may be closed while the direction is still forming.

Report bugs and ideas with the issue forms, and search existing issues and pull requests first. Report security problems privately; see [SECURITY.md](SECURITY.md).

## Workflow

Outside contributors work from a fork. Only the maintainer can push branches to this repository.

1. Fork the repository and clone your fork.
2. Create a branch from `main`, such as `fix/inspector-spacing`.
3. Follow the [README setup](README.md#run-locally): install Bun 1.4.2 and Rust through rustup, then run `bun run setup`.
4. Make your change and run the checks below.
5. Push to your fork and open a pull request against `main`.

Keep each pull request focused on one problem. Include everything that fix needs, such as tests and docs, and put cleanup, refactors, or a second fix in their own pull requests. Pull requests are squash-merged, so the PR title becomes the commit message on `main`.

## Run checks locally

This repository has no hosted CI. You run the checks and report the results in your pull request. Choose the checks that cover your change:

| Change | Command |
| --- | --- |
| Model, persistence, source adapter, or service | `bun run test` |
| Studio interaction or state | `bun run test:ui` |
| Browser input, preview, or app editing | `bun run test:preview` |
| Studio UI or layout | `bun run verify` and `bun run build` |
| Ember demo behavior | `bun tools/demo.mjs test web` |
| Documentation only | Check links and command names, then `git diff --check` |

`test:ui` and `verify` use ports 5175 and 5176, which conflict with a running editor. Stop `bun run dev` before running them. See [docs/development.md](docs/development.md) for commands, ports, and the source layout.

Before changing studio controls, theme tokens, icons, or canvas interactions, read [docs/studio-design-system.md](docs/studio-design-system.md).

### Performance changes

Measure before and after on the same machine and setup. For canvas navigation, `bun run profile:canvas --variant base=main --variant change=WORKTREE` compares your working tree against `main`; see [Benchmark canvas navigation](docs/development.md#benchmark-canvas-navigation). Report the numbers and how you ran them.

## Pull request title

Use `<type>(<scope>): <summary>`, within 72 characters:

- `fix(ui): correct inspector field spacing`
- `feat(studio): add viewport presets`
- `docs(repo): clarify setup steps`

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. Use a short lowercase scope such as `ui`, `studio`, `preview`, `ember`, or `repo`. Write the summary as an imperative phrase with no trailing period. For a breaking change, add `!` before the colon and describe the migration.

## Pull request description

The [pull request template](.github/pull_request_template.md) has four parts:

- **Summary**: the problem and the resulting behavior. Link the related issue.
- **Screenshots**: before and after images for any visible change. Take both at the same window size, zoom, and theme. Use a short recording for interactions such as drag, hover, or animation. If the change has no visible effect, write "Not applicable" and say why.

  Add images and recordings as GitHub attachments: drag or paste them into the description or a comment. Don't commit them to the repository or link to files on your branch.
- **Validation**: how you checked the change and what you saw, such as reproduction steps before and after a fix, or measurements for a performance change. List the commands you ran and their results, and anything you couldn't test. "Tests pass" on its own isn't enough.
- **Checklist**: the conventions below.

If an AI agent did some or all of the work, name the model and tool at the end of the description. Agent-written pull requests are welcome; you're responsible for having reviewed and run the change.

## Conventions

- Add notable user-visible changes to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**, grouped under Added, Changed, or Fixed.
- Update the documentation that your change affects. Keep the root README focused on startup and documentation links.
- Don't commit screenshots, recordings, or other proof images. Attach them to the pull request instead.
- Don't edit generated files: `exact.mjs`, the `exact:begin` instruction blocks, and `studio/icons.contract`. After changing the vendored icons, run `bun run icons`.
- Keep the Exact SDK revision in `tools/setup.mjs` unchanged unless the pull request is an SDK upgrade.

## Licensing

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
