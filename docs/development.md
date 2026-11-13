# Development reference

The root [package.json](../package.json) defines the development commands. [tools/setup.mjs](../tools/setup.mjs) pins the Exact SDK revision, rejects a checkout at another revision, and builds the Contract compiler that validates source writes. Runtime adapters depend on that pin.

## Develop on Windows with WSL2

Run the studio and its helper in Ubuntu on WSL2. Open the studio in your Windows browser. The pinned SDK's compiler and source-editing server fail on native Windows. The compiler can overflow its stack, and the editing server requires Unix filesystem operations. The root launchers stop with these instructions before starting a native Windows build or helper.

1. In an administrator PowerShell, install Ubuntu:

	```powershell
	wsl --install -d Ubuntu-24.04
	```

	Restart Windows if requested. Open Ubuntu and complete its username and password setup. Use `wsl --list --verbose` to check that Ubuntu uses version 2. See Microsoft's [WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install) for installation problems.

2. Run the remaining setup commands in Ubuntu. Install the build prerequisites:

	```sh
	sudo apt-get update
	sudo apt-get install -y --no-install-recommends build-essential pkg-config libssl-dev unzip curl git ca-certificates
	```

3. Install [Bun](https://bun.sh/docs/installation) and [Rust through rustup](https://rust-lang.org/tools/install/):

	```sh
	curl -fsSL https://bun.sh/install | bash -s "bun-v1.4.2"
	curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain none
	export PATH="$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
	```

4. Clone into the Linux home directory and run setup:

	```sh
	git clone https://github.com/diegoag64/exact-design.git ~/exact-design
	cd ~/exact-design
	bun run setup
	sudo "$HOME/.bun/bin/bun" .exact-sdk/node_modules/playwright-core/cli.js install-deps chromium
	```

	Keep the checkout in the [WSL filesystem](https://learn.microsoft.com/en-us/windows/wsl/filesystems), such as `~/exact-design`. A checkout under `/mnt/c` adds filesystem overhead and shares Windows file semantics. Keep the SDK, dependencies, and build output in the Linux checkout too. A Windows checkout and a Linux clone are separate copies; edits do not synchronize automatically.

5. Start the studio from that checkout:

	```sh
	bun run dev
	```

	In a second Ubuntu terminal, run `cd ~/exact-design` and `bun run demo`. Open `http://127.0.0.1:5173` in your Windows browser, or use the setup link printed by the demo. WSL forwards the loopback ports to Windows. Keep both terminals open and press Ctrl+C to stop each server.

Run the checks below in Ubuntu too. Stop the studio before `test:ui` or `verify` because they use the same helper ports. If a URL does not load, confirm both servers are running and ports 5173, 5174, and 5175 are not occupied by another Windows or WSL process. Use `127.0.0.1` consistently for the editor and demo.

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

## Native iOS previews

Native frames show screenshots of the app's native build running in the iOS Simulator. The studio helper (`tools/discovery-server.ts`) owns the pipeline in `tools/native-previews.ts`; under the test launchers (`EXACT_DESIGN_TEST=1`) it serves the canned states in `tools/native-fixture.ts` instead, so no Xcode is needed for `test:ui` or `verify`. The device catalog in `studio/devices.ts` names each native device's CoreSimulator device type.

### Helper protocol

`POST /native` with a JSON body answers with `text/event-stream`. Each `data:` line is a complete JSON snapshot; the stream stays open and sends a new snapshot whenever anything in it changes, including a frame going stale after a source edit.

```json
{"project":"http://127.0.0.1:5174","run":"","frames":[{"id":"view-7","device":"native-iphone-17","route":"/diary/add"}]}
```

- `project` is the connected project's local origin. `device` is a catalog slug from `studio/devices.ts` whose platform is `ios`. `route` is the screen's route.
- `run` is `""` to report status only. A new non-empty token captures every listed frame once, building first when the inputs changed. Repeating a token the helper has already started reports that job and never starts it again; the studio sends a fresh token for each **Refresh** press.

```json
{"state":"working","phase":"build","message":"Building Ember for iOS…","error":"","done":0,"total":4,
 "frames":[{"id":"view-7","state":"ready","shot":"http://127.0.0.1:5175/native/shot/<key>/<file>.png?v=1794540000000","width":1206,"height":2622,"capturedAt":1794540000000,"error":""}]}
```

| Field | Values |
| --- | --- |
| `state` | `idle` (nothing running), `working`, `error` (the last job failed as a whole), `unavailable` (no Mac, no Xcode, or no simulator runtime) |
| `phase` | `""`, `build`, `boot`, `install`, `capture` while `working` |
| `message` | One short sentence for the status toast |
| `error` | The job's failure, or why native previews are unavailable |
| `done`, `total` | Frames captured in the current job, of those it will capture |
| `frames[].state` | `empty` (never captured), `queued`, `capturing`, `ready`, `stale` (a screenshot exists but the app's inputs changed since), `error` |
| `frames[].shot` | Absolute URL of the latest screenshot, or `""`. A `stale`, `queued` or `capturing` frame keeps its previous screenshot |
| `frames[].width`, `height` | Screenshot size in device pixels, or 0 |

Frame ids are echoed unchanged. `GET /native/shot/<key>/<file>.png` serves a screenshot from the helper's cache.

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
