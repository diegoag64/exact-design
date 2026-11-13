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

Run the checks below in Ubuntu too. `test:ui` and `verify` use private ports and leave the studio running. If a URL does not load, confirm both servers are running and ports 5173, 5174, and 5175 are not occupied by another Windows or WSL process. Use `127.0.0.1` consistently for the editor and demo.

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

`test:ui` and `verify` copy current tracked and untracked source into `.exact/verification/run-*/workspace`. They start private helper and fixture servers on OS-assigned ports, then substitute those origins only in the copied app and tests. Each run has separate build output. The copied generated launcher uses the pinned SDK and retains its Bun version check. Direct SDK commands, including `bun tools/run.mjs test web`, still use fixed ports and are not isolated. The preview tests create temporary copies under `.exact` and use separate ports. Tests that compile Contract require the SDK toolchain even when run through `bun run test`.

Each verification run prints its artifact directory. `output.log` retains console output, `result.json` records the source HEAD, SDK revision, dirty state, command, private origins, and exit status, and `shots/` retains SDK audit captures and findings when available. Runs remove their copied source and builds and stop their owned servers and child processes, including on SIGINT or SIGTERM. Output is piped to retain logs, so SDK terminal colors and interactive progress may be absent. Logs and captures remain until you delete that run directory. A forced kill cannot run cleanup.

A bind failure in the runner's helper or fixture reports a socket-permission diagnostic before compilation. SDK server and browser failures retain the SDK's own diagnostic. If an agent sandbox blocks local sockets, rerun the same root command with approved local-server access. A permissions failure is not evidence of a code regression.

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

The **Native preview** drawer shows screenshots of the app's native build running in the iOS Simulator. While it is open, the studio asks the helper for one frame per connected screen with a route, on the drawer's device and appearance; the frame id is the screen id. The canvas never shows native frames, and `loadWorkspace` turns native frames saved by earlier builds into fixed-height web frames. The studio helper (`tools/discovery-server.ts`) owns the pipeline in `tools/native-previews.ts`; under the test launchers (`EXACT_DESIGN_TEST=1`) it serves the canned states in `tools/native-fixture.ts` instead, so no Xcode is needed for `test:ui` or `verify`. `nativeDevices` in `studio/devices.ts` names each native device's CoreSimulator device type; these devices are not viewport presets.

### Attribution

The native capture loop draws on ideas and techniques from [Expo Explore](https://github.com/expo/explore), by Expo and its contributors. We consulted revision [`1de4213`](https://github.com/expo/explore/tree/1de4213db59dba306a2f9c930d514e83594b4455), particularly:

- [Local Simulator helpers](https://github.com/expo/explore/blob/1de4213db59dba306a2f9c930d514e83594b4455/src/capture/local-simulator.ts): approve the app's link scheme once and switch appearance through `simctl`.
- [Root-link resets](https://github.com/expo/explore/blob/1de4213db59dba306a2f9c930d514e83594b4455/src/capture/route-reset.ts): keep the app running and return to its root before opening each route.
- [Route capture](https://github.com/expo/explore/blob/1de4213db59dba306a2f9c930d514e83594b4455/src/capture/route-capture.ts) and [readiness](https://github.com/expo/explore/blob/1de4213db59dba306a2f9c930d514e83594b4455/src/capture/readiness.ts): observe the accessibility tree to decide when a screen is ready to capture.

Exact Design implements these techniques with the Exact SDK and local Simulator tools. Explore is a design reference, not a runtime dependency. The Exact-specific readiness checks, pixel fallback, frame cache, and memory guards are implemented in this repository.

### Pipeline

1. **Find the app.** The studio sends only the project URL. The helper reads that server's `manifest.json` and matches it, by `name` and `protocol_handlers`, against registered app folders: `examples/ember` and each entry of `EXACT_DESIGN_NATIVE_APPS` (separated by `:`, absolute or relative to the repository). The helper never builds a folder named by a request.
2. **Build.** `tools/native-build.mjs` runs the SDK's per-app CLI with `ios --no-install`, as `tools/demo.mjs` does. The input signature hashes the app folder's files (skipping `.exact`, `target`, `node_modules`, `dist` and dot-folders), the SDK revision and the Xcode version. An unchanged signature skips the build. The helper tracks installed builds by device and bundle ID across projects, so switching projects with the same bundle ID reinstalls the correct build. After a helper restart, the first capture reinstalls once because installation ownership is unknown. The build keeps the signature read before it starts. Source edits during a build leave its screenshots stale. If the SDK adds native settings to `app.json` on the first build, the next refresh rebuilds once to include those changes. A first build needs 20 GB free and any build 10 GB. The helper streams the build's output through `BuildProgress`, which reads cargo's `Compiling <crate>` lines and swift-build's `[n / m]` target counts for the drawer, and records each build's duration. The cache and `target/` belong to the checkout, so a new checkout or worktree starts with a cold build.
3. **Prepare devices.** Each device runs on the newest installed iOS runtime that supports its device type. A runtime can support only a few types; on the development Mac, iOS 27.1 runs only iPhone Duo, so iPhone 17 uses iOS 27.0. The helper creates and reuses simulators named `Exact Design <device>` and never touches others. Capture jobs from different projects queue across the helper so they cannot drive the same device at once. Each job lists the simulators once (`simctl list devices`). A device is prepared once per helper process: boot, the 9:41 status bar, install when the build changed, approval of the app's link scheme, and Reduce Motion. A later job skips these unless the device was shut down or the app reinstalled. The helper finds simctl once with `xcrun --find simctl` and runs it directly. It keeps the simulators it booted running until `bun run dev` stops. Shutdown discards queued jobs and stops the active job between steps, then closes accessibility sessions and shuts down owned devices. An external command already in progress must finish first.
4. **Open and capture.** The scheme approval (a `com.apple.launchservices.schemeapproval` default) lets `simctl openurl` open the app's links without the "Open in …?" prompt. The app keeps running between screens and jobs. It is launched only when it is not running, and relaunched only after an install or a Reduce Motion change. For each screen the helper opens the root link `<scheme>://`, which dismisses a sheet and leaves a full-screen route, waits until the screen is ready, opens `<scheme>://<route>`, waits again, and takes a PNG with `simctl io screenshot`. For `/`, the root link is the capture. A screen that does not become ready is reset and opened once more; a second miss marks that frame as an error and keeps its previous screenshot visible with a compact error notice.
5. **Readiness.** By default the helper reads the app's accessibility tree through the SDK's touch runner (`.exact-sdk/host/apple/touches.mjs`), one session per device. A screen is ready when the app is in front, shows no alert and an Exact route container (`exact-navigation-*`), and its elements (type, identifier and frame, not text) have held still for 600 ms. They must also differ from the screen before the link, or 1500 ms must have passed, for a link to the screen already shown. A transition can hold still without a route container, so stillness alone is not enough. The deadline is 8 s, twice that within 60 s of a boot or launch, one and a half times on pixels, and two and a half times for a first launch. Without a runner the helper compares BMP screenshots: ready when two in a row differ in under 0.5 % of sampled pixels and, unless 1500 ms have passed, differ from the screen before the link. Starting a runner is heavy, so runners open only between jobs, or at once when the app is already running at the start of a job; until then, and when one fails to open twice, the device uses screenshots.
6. **Reduce Motion.** Managed simulators run with Reduce Motion on. The stills look the same, but Ember's animated backgrounds then hold still between screenshots; without it no screen ever stops changing.
7. **Choose frames.** **Refresh all** captures only frames that are not current for the build, device, route and appearance; when every frame is current the job ends at once. **Refresh** captures the frames it names again. Each frame has an appearance (`light` or `dark`); a device's frames are grouped by appearance, switched with `simctl ui appearance`, and the device goes back to light at the end.
8. **Run devices in parallel.** Devices run together up to `EXACT_DESIGN_NATIVE_PARALLEL`. Booted devices go first. At the start of a job, each device that is not booted needs 2 GB of available memory (`vm_stat`: free, inactive and speculative pages). Before each cold boot, if memory is short and another device is still booting or launching, the helper waits for it (up to 90 s) and then boots anyway.

| Variable | Default | Purpose |
| --- | --- | --- |
| `EXACT_DESIGN_NATIVE_APPS` | none | Extra app folders, separated by `:` |
| `EXACT_DESIGN_NATIVE_CACHE` | `.exact/native-previews` | Cache folder |
| `EXACT_DESIGN_NATIVE_PARALLEL` | 4 | Devices at once, before the memory guard |
| `EXACT_DESIGN_NATIVE_REDUCE_MOTION` | on | `0` turns Reduce Motion off |
| `EXACT_DESIGN_NATIVE_READINESS` | `ax` | `pixel` uses screenshots only and never opens a touch runner |
| `EXACT_DESIGN_NATIVE_POLL_MS` | 300 | Accessibility tree poll interval |
| `EXACT_DESIGN_NATIVE_STABLE_MS` | 600 | How long a screen's elements must hold still |
| `EXACT_DESIGN_NATIVE_READY_MS` | 8000 | Readiness deadline before multipliers |
| `EXACT_DESIGN_NATIVE_AX_MIN_GB` | 0 | Available memory each touch runner needs to start; 0 means no check |

The cache lives in `.exact/native-previews/<app key>/` (`EXACT_DESIGN_NATIVE_CACHE` moves it): `state.json`, `build.log`, and the latest screenshot for each device, route and appearance. Readiness screenshots go to `.exact/native-previews/probe/`.

Measured with Ember on the development Mac: a cold build took 343 s and about 5.5 GB; a rebuild with no changes took 18 s; installing took 16 s.

Measured during capture-loop development on this 16 GB Mac with 4 devices × 4 routes, at load averages of 150–900 from the simulators themselves and other work. The old loop, which relaunched the app for each screen: cold 326 s, warm full refresh 313 s (about 20 s per screen), a refresh with no changes 313 s because it recaptured everything, and no single-frame refresh. The current loop: cold 210–255 s; warm full refresh 24 s with every touch runner up, 84 s on screenshots only, and up to 146 s while runners were failing to start; a refresh with no changes is instant ("up to date"); a single frame takes 4.4–7.2 s with the accessibility tree and 21 s on screenshots. One warm device takes about 3.5 s per screen with the tree; iPhone 17 alone captured 2 screens in 7.4 s. These runs used different readiness settings and system loads, so they are not a controlled speedup comparison. Four simulators make a 16 GB Mac swap: use fewer devices, or set `EXACT_DESIGN_NATIVE_READINESS=pixel` if touch runners fail to start.

`studio/native-previews.test.ts` tests the pipeline with a fake command runner, fake readiness and a fake clock. Its end-to-end test runs only with `EXACT_DESIGN_NATIVE_E2E=1` on a Mac with Xcode: it captures Ember's `/` and `/diary/add` on iPhone 17, captures them again warm, and checks that a refresh with no changes captures nothing. Run it from the repository root with `EXACT_DESIGN_NATIVE_E2E=1 bun run test`.

### macOS later

`tools/simulators.ts` keeps the platform steps behind `NativeTarget`. A macOS target would build with `mac` instead of `ios --no-install`, launch the `.app` once and open each route with its link (`open <scheme>://<route>`), size its window to the frame, and capture that window with `screencapture -l <window id>`; readiness would compare those window captures. The catalog would gain `platform: 'macos'` devices; the protocol already carries the device per frame.

### Helper protocol

`POST /native` with a JSON body answers with `text/event-stream`. Each `data:` line is a complete JSON snapshot; the stream stays open and sends a new snapshot whenever anything in it changes, including a frame going stale after a source edit.

```json
{"project":"http://127.0.0.1:5174","run":"","capture":[],"frames":[{"id":"screen-7","device":"native-iphone-17","route":"/diary/add","appearance":"light"}]}
```

- `project` is the connected project's local origin. `device` is a catalog slug from `studio/devices.ts` whose platform is `ios`. `route` is the screen's route. `appearance` is `light` or `dark`; it defaults to `light`, and a screenshot is kept per device, route and appearance.
- `run` is `""` to report status only. A new non-empty token starts one capture job, building first when the inputs changed. Repeating a token the helper has already started reports that job and never starts it again; the studio sends a fresh token for each press.
- `capture` chooses what that job captures. Empty or absent (**Refresh all**): every listed frame that is not `ready`, so a frame already current for the build and its device is skipped; when every frame is current the job ends at once with "Native previews are up to date." A list of frame ids (**Refresh**): exactly those frames, captured again even when current. `capture` without a new `run` token does nothing.

```json
{"state":"working","phase":"build","message":"Building Ember for iOS…","error":"","done":0,"total":4,
 "frames":[{"id":"screen-7","state":"ready","shot":"http://127.0.0.1:5175/native/shot/<key>/<file>.png?v=1794540000000","width":1206,"height":2622,"capturedAt":1794540000000,"error":""}]}
```

| Field | Values |
| --- | --- |
| `state` | `idle` (nothing running), `working`, `error` (the last job failed as a whole), `unavailable` (no Mac, no Xcode, or no simulator runtime) |
| `phase` | `""`, `build`, `boot`, `install`, `capture` while `working` |
| `message` | One short sentence for the drawer's status line |
| `error` | The job's failure, or why native previews are unavailable |
| `done`, `total` | Frames captured in the current job, of those it will capture (skipped current frames are not counted) |
| `steps` | While `working` and past the queue: `build`, `device` and `capture`, each with a `label`, a `state` (`pending`, `active`, `done`, `skipped`, `failed`) and a `detail` such as `Compiling Swift · ExactKit`, `Up to date` or `1 of 2`. Empty otherwise |
| `progress` | The active step's real fraction, or -1. A build reports Swift's `[n / m]` target count; capture reports `done / total`. Cargo prints no total, so Rust compilation reports -1 |
| `elapsed` | Seconds the active step has run. The helper sends a snapshot every second while a job runs |
| `estimate` | Seconds the last comparable build took (cold or incremental, from `state.json`), or 0 |
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
