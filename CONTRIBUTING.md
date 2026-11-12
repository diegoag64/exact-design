# Contributing

Thanks for your interest in Exact Design. This is a small project maintained in spare time, so reviews may take a while. For anything larger than a small fix, open an issue first so we can agree on the approach before you write code.

## Ways to contribute

- **Report a bug** with the bug report form. Include steps to reproduce and a screenshot or recording when the problem is visible.
- **Suggest a feature** with the feature request form. Describe the problem before the solution.
- **Send a pull request** for an issue you've discussed, a documentation fix, or a small bug fix.

Report security problems privately. See [SECURITY.md](SECURITY.md).

## Workflow

Outside contributors work from a fork. Only the maintainer can push branches to this repository.

1. Fork the repository and clone your fork.
2. Create a branch from `main`, such as `fix/inspector-spacing`.
3. Follow the [README setup](README.md#run-locally): install Bun 1.4.2 and Rust through rustup, then run `bun run setup`.
4. Make your change and run the checks below.
5. Push to your fork and open a pull request against `main`.

Keep each pull request focused on one change. Pull requests are squash-merged, so the PR title becomes the commit message on `main`.

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
- **Validation**: the commands you ran and their results, and anything you couldn't test.
- **Checklist**: the conventions below.

## Conventions

- Add notable user-visible changes to [CHANGELOG.md](CHANGELOG.md) under **Unreleased**, grouped under Added, Changed, or Fixed.
- Update the documentation that your change affects. Keep the root README focused on startup and documentation links.
- Don't edit generated files: `exact.mjs`, the `exact:begin` instruction blocks, and `studio/icons.contract`. After changing the vendored icons, run `bun run icons`.
- Keep the Exact SDK revision in `tools/setup.mjs` unchanged unless the pull request is an SDK upgrade.

## Licensing

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
