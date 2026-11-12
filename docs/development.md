# Development reference

The root [package.json](../package.json) defines the development commands. [tools/setup.mjs](../tools/setup.mjs) pins the Exact SDK revision and rejects a checkout at another revision. Runtime adapters depend on that pin.

## Commands

Commands run from the repository root after `bun run setup`.

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start the studio on port 5173 and the helper on 5175 |
| `bun run demo` | Start Ember on port 5174 and print its setup link |
| `bun run test` | Test models, persistence, source editing, and preview services |
| `bun run test:ui` | Run Exact behavior tests |
| `bun run test:preview` | Run browser regressions in isolated app copies |
| `bun run verify` | Run the Exact layout and behavior audit |
| `bun run build` | Build the studio web app into `studio/dist` |
| `bun run profile:canvas` | Benchmark canvas pan and zoom with many live previews |
| `bun run icons` | Generate the Contract icon component from vendored SVGs |
| `bun tools/demo.mjs test web` | Run Ember behavior tests |

`test:ui` and `verify` use ports 5175 and 5176 for the helper and fixture. They conflict with a running editor's helper. The preview tests create temporary copies under `.exact` and use separate ports. Tests that compile Contract require the SDK toolchain even when run through `bun run test`.

The root launchers set `EXACT_FEEDBACK=0`. Generated SDK instructions describe a broader workflow than this repository uses.

## Source layout

| Location | Responsibility |
| --- | --- |
| `studio/app.contract`, `studio/app.ts` | Editor UI, actions, and data sources |
| `studio/model.ts`, `studio/workspace.ts` | Document edits, Contract export, screens, and viewports |
| `studio/persistence.ts`, `studio/draft-storage.ts` | Workspace saves and per-project drafts |
| `studio/render.ts` | Canvas labels and selection handles |
| `studio/ui.contract`, `studio/app.tamber` | Shared controls and theme tokens |
| `studio/modules/web/` | Browser input, focus, and preview runtime lifecycle |
| `tools/discovery-server.ts`, `studio/discovery.ts` | Local route discovery |
| `tools/design-session.ts`, `tools/design-drafts.ts` | Inspection sessions, draft patches, and Apply |
| `tools/layout-source.ts`, `tools/source-properties.ts` | Source addresses and compiler-validated writes |
| `tools/inspector-fields.ts`, `tools/property-catalog.ts` | Property controls and writable defaults |
| `tools/design-preview-client.js`, `tools/preview-channel.ts` | Temporary preview edits and selection feedback |
| `tools/element-bridge.ts`, `tools/element-bridge-client.js` | Preview inspection and element navigation |
| `tools/event-stream.ts`, `tools/shared-runtime.ts` | Shared connections and the pinned runtime adapter |
| `studio/design-history.ts`, `studio/draft-review.ts` | Persistent timeline and draft review model |
| `examples/ember/` | Interactive demo app |
| `fixtures/ember/` | Notebook app used by browser regressions |

The [studio design system](studio-design-system.md) describes UI ownership and interaction rules in detail.

## Profile canvas navigation

Use a settled workspace with the same routes, viewport sizes, zoom, and browser dimensions for each comparison. Measure idle, pan, and zoom separately. Run performance measurements after other browser tests finish.

Exact's `agent web` driver supports `perf canvas-stage during "tap zoom-in"` to count binding evaluations and authored elements. Give the drive a named `--storage` and advance its clock through setup before sampling. These counters describe Exact's work, not browser painting or GPU cost.

For browser timings, the pinned SDK's `suiteBrowser('chromium', {needs: ['perf']})` selects full Chromium instead of the headless shell. It still runs with `--headless=new`, and Playwright pages default to a device scale factor of 1, so its timings do not match a headed browser on a high-density display. Capture animation-frame intervals and a Chromium rendering trace. Check an idle sample first: callbacks near one second apart indicate throttling, not useful interactive timings. Keep warmup, browser flags, and instrumentation identical between variants.

The decoration renderer in `studio/render.ts` caches the current serialized scene and bounded label widths per drawing context, and clears the widths after a font load. It measures labels at their fixed screen size and skips offscreen inactive decorations. Exact's canvas recorder still measures each `fillText` call on the page, so native `measureText` counts include draw replay work as well as label fitting.

The canvas keeps separate preview layers. A shared transformed parent reduced Exact binding evaluations in an Ember experiment but increased rendering cost. Pausing preview animations reduced idle work without improving navigation timings, so previews retain their normal animation behavior.

## Preview limits

The shared runtime supports the pinned Exact JavaScript development bundle and TypeScript request/reply data sources. Streaming sources, Rust sources, and native module operations need separate adapters. Unsupported bundles and browsers without SharedWorker retain independent state.

Preview adapters change served code without changing app source or the SDK. Apply is the explicit source-write operation. CSS classes alone cannot identify editable source because Exact deduplicates identical styles.

Workspace timeline entries retain document snapshots. Source entries retain patches, addresses, and file hashes, not complete application snapshots. Historical replay and rollback are not implemented.

## Benchmark canvas navigation

`bun run profile:canvas` measures pan and zoom with 30 live Ember previews. It copies the studio, its helper, and Ember under `.exact`, serves them on free ports, and leaves a running editor and its saved data untouched. Each trial starts a fresh Chromium, opens the setup link, waits for every preview, and fits all screens. It then records idle, pan, and zoom with a rendering trace for each.

Pan moves in one direction and back. Zoom sweeps from the fitted overview to 100% and back, pivoting on the canvas centre. Both send one wheel event per animation frame unless `--events-per-frame` says otherwise.

| Option | Default | Purpose |
| --- | --- | --- |
| `--variant name=ref` | `worktree=WORKTREE` | Studio version to measure: a Git ref, or `WORKTREE` for files on disk. Repeat to compare versions. |
| `--trials N` | 5 | Trials per variant. Variants alternate in ABBA order to cancel drift. |
| `--frames N` | 120 | Animation frames per scenario |
| `--events-per-frame N` | 1 | Wheel events per frame. The total pan or zoom stays the same. |
| `--dpr N` | 2 | Device scale factor |
| `--headed` | off | Show the browser. The default runs `--headless=new`, which does not present to a display. |
| `--out FILE` | `.exact/profile-canvas.json` | Report with every trial. `FILE.partial` is updated after each trial, so an interrupted run keeps its results. |
| `--traces DIR` | none | Save each Chromium trace |
| `--categories LIST` | none | Add trace categories, such as `disabled-by-default-viz.quads` |
| `--preview-css NAME=CSS` | none | Inject CSS into every preview of variant `NAME`, to test an effect's cost |
| `--reduce-effects NAME` | none | Turn on **Reduce preview effects** in variant `NAME` before measuring. Repeat for several variants. |
| `--zoom-levels LIST` | none | Also record idle and pan at each zoom, such as `0.25,0.5`, centred on the nearest preview. Each scenario reports how many previews were visible. |
| `--keep` | off | Keep the temporary copies under `.exact` after the run |

The summary reports, per variant and scenario, the median across trials of each trial's mean and p95 frame interval, and the spread of trial means. Frame intervals come from animation-frame callbacks on the studio page. The trace columns give the share of trace time the GPU main thread was busy, the share of compositor frames dropped or partly presented, and layerization time per frame. Each trial in the report also lists the busiest events on the GPU, renderer, and compositor threads.

Compare variants only when repeated runs of one version agree. Run benchmarks after other browser tests finish, and avoid other heavy work on the machine while they run.
