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
| `fixtures/morrow/` | Notebook app used by browser regressions |

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
