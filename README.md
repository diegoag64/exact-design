# Exact Design

A visual editor for Exact interfaces. Arrange screens and linked viewport variants on one canvas, adjust their layers, render running Exact apps, and export editable screen layouts as Contract source.

## Run the editor

Install Bun 1.4.2 and Rust through rustup. From this repository:

```sh
bun run setup
bun run dev
```

Open the URL printed by the development server. Use a desktop window at least 1000 pixels wide for both panels. The two panel icons in the top bar independently show or hide Screens and the inspector. Your choices survive a reload. On narrower windows, panels start hidden and open over the canvas when needed. The centered toolbar can add a screen even with the sidebar hidden.

`bun run dev` also starts the screen discovery helper on `127.0.0.1:5175` and stops it with the editor. Keep that port free. Discovery is a local development feature; a hosted editor does not use this helper.

Setup downloads Exact at revision `336a059fd1464bee7c61640afb7124ebf276d06d` into the ignored `.exact-sdk` directory. Exact's setup command installs its toolchain requirements. The runtime is pinned because its APIs are still changing.

## Arrange screens

Click + beside Screens to name a screen and choose its first viewport. With a project connected, choose a project route or a blank editable screen. The sidebar groups viewport variants under each screen. Use the chevron to collapse or expand a group. Click a screen name or viewport to smoothly pan to its top, centered horizontally in the visible canvas, without changing zoom. Scrolling or dragging interrupts the pan, and reduced motion positions it immediately. Select a viewport in the sidebar or click its canvas title to edit its screen name and dimensions. Drag the title to move the frame; drag the lower-right handle to resize it. Moving frames snap to nearby edges, centers, and an 80-pixel gap beside other frames. Pink guides show the alignment or spacing. Hold Option/Alt while dragging to ignore snapping. A completed drag is one undo step.

The inspector separates shared Screen settings (name and route) from the selected Viewport. Choose its preset from the dropdown, or enter Width and Height for a custom size. Use Add viewport to reveal phone, tablet, and desktop options that create another linked frame. Layer edits apply to every viewport of that screen. Duplicate screen creates an independent copy of the content. Deleting the last viewport of a screen removes that screen; the final viewport in the workspace cannot be deleted. Undo restores deleted content.

New screens appear below the existing frames. Viewport variants appear to the right, and the canvas fits new frames into view. Click a sidebar entry to focus a viewport, or the zoom percentage to fit all screens.

## Connect a running Exact app

Run the editor with `bun run dev` and open `http://127.0.0.1:5173/`. In your Exact app directory, start its dev server with this editor port allowed:

```sh
EXACT_TOOL_PORT=5173 bun exact.mjs web --port 5174
```

Click **Connect project** above Screens, give the project a name, and enter `http://127.0.0.1:5174`. The editor reads the app's route manifest automatically. Click + beside Screens, choose an available screen, and select its first viewport. The name and path fill in when you choose a screen; you can edit both before adding it. Routes already in the library are marked **Added**. Add phone, tablet, and desktop variants to compare each screen at independent viewport sizes. Exact's `exactViewport()` and responsive styles receive each frame's dimensions, regardless of canvas zoom.

Local app screens expand to their full rendered height when they load. Their widths still determine responsive layout. **Auto** beside Height keeps each frame fitted to its content as images load, content changes, or the width changes. The preset height acts as a minimum. Enter a Height to use a fixed viewport again, or click **Auto** to restore content sizing. This choice survives a reload. Canvas bounds, frame selection, snapping, and placement use the displayed height.

Auto height expands the app's main vertical scrolling regions through preview-only CSS. It does not change source. The running app receives the expanded frame height, so use fixed height when testing behavior tied to a device's height. Automatic sizing supports local HTTP development servers. Remote previews keep their fixed viewport. Infinite feeds and virtualized lists show the content the app currently renders; Auto does not fetch every record. Expanded frames are bounded at 50,000 pixels, and canvas zoom reaches 1% for long screens.

Use **Refresh screens** in the Add screen form after adding routes to your app. A dynamic route such as `/note/:id` is marked **Set path**: replace the parameter with a real value, such as `/note/7`, before adding it. Discovery does not invent record IDs or open every route. You can always enter a name and route manually, including when the server is offline or has no manifest. Choose **Blank** for an editable screen.

Discovery reads the `routes.json` file produced by Exact's web build and dev server. The local helper makes this read because the app server does not allow the editor to fetch the manifest across browser origins. It only requests that file, does not follow redirects, and does not change the app's source. It omits fallback routes and merges duplicate paths. Refreshing the list never removes or changes screens already on the canvas.

Click the project name in the sidebar to change its server address. Every linked screen follows that change. Disconnect keeps the current preview URLs, and Undo restores the connection. Existing standalone Preview URLs still work; connecting a project adopts matching URLs into its route library. The inspector edits a linked screen's route or a standalone screen's Preview URL.

The canvas lets you arrange and resize frames. Use Preview to interact with the active app, or Edit app to select its elements and change supported visual properties. Clearing Preview URL restores that screen's editable layers. Export and layer tools are disabled while a screen is connected.

Exact's dev server restricts framing to its configured tool origin. Use `127.0.0.1` for the editor URL and restart the app server with `EXACT_TOOL_PORT` matching the editor port if a frame is blank. The app server must remain running. Other servers must allow embedding from the editor origin.

To try the included Exact example, run this in a second terminal:

```sh
bun run demo
```

Connect a project named Morrow at `http://127.0.0.1:5174`. The Add screen form discovers **Library** at `/` and **Note** at `/note`; choose either and add viewport variants. The example is a personal notebook with illustrated covers, search, collections, favorites, and an editor that saves notes locally. Cards use three columns on desktop, two on tablet, and one below 600 pixels. Light and dark themes follow the system setting. Each frame has its own running instance; browser storage remains shared by origin.

## Edit a connected app

Select a connected viewport, then click **Edit app** in the inspector. The left sidebar becomes a collapsible **Layers** tree of the app's rendered elements. Click a layer to select the exact container, button, image, or text node; it scrolls into view. The inspector shows the selected name once, its element type, and a button to select its immediate parent. The left tree provides the full hierarchy. Layout containers are named by their role rather than their combined text content. Selecting an element directly on the canvas expands its path in the tree. Hover outlines show what a canvas click will select, and Exact highlights matching source instances across viewport copies. Repeated instances of the same source element can all be highlighted. These clicks inspect the app rather than activating it. **Done editing** or Escape returns to arranging screens.

Layer and parent selections are pushed to the live preview immediately, independently of the hierarchy refresh. The clicked row is marked selected while Exact confirms its source; the previous element's controls are hidden during that check. Confirmation uses a short, bounded refresh interval, then returns to the regular background rate. If the push connection is unavailable, selection falls back to the hierarchy connection.

Hover over a layer to outline its element in the preview without changing the selection or inspector. The outline follows scrolling and layout changes, and clears when the pointer leaves the row or editing ends. Clicking an element in the preview expands its parents and scrolls its layer row into view. Clicking the same element again or reopening the Layers panel reveals it again; background refreshes and source edits leave manual tree scrolling alone.

Selected elements show padding and flex-gap bands on the canvas. Click an editable value, enter a number or CSS length, and press Enter to preview it. Escape or leaving the field cancels that input. Editing one padding side or gap axis preserves the others, including shorthand units. Shared style values are identified in their tooltip. Computed values are read-only. Controls stay the same size at different canvas zoom levels and follow scrolling and draft edits. Grid gaps and unresolved percentage gaps remain available through the inspector rather than the canvas overlay.

Local previews load through a development bridge as soon as a screen connects, without changing app source or the SDK. Editing reuses that frame. Browser-only storage belongs to the bridge's separate origin. The bridge uses a stable local port for each project URL. Preview control events share one WebSocket per frame, leaving the browser's HTTP connections free for app scripts, data loads, and rebuild checkpoints when many frames are open. Its hierarchy shows up to 600 mounted, visible elements per viewport; unmounted virtualized content and hidden routes are not listed. Library components without editable source can still be selected.

The inspector offers existing visual attributes that Exact marks editable in Contract source or a shared style. Enter a value and press Enter or leave the field to preview it. Edits become a design draft. They update the viewport copies without writing source, compiling the app, or replacing its frame. A shared style affects each source instance that uses that property, while explicit overrides retain their values. Changing a token reference replaces that attribute's value in the draft. Editing token definitions is not implemented.

The inspector separates **Layout**, **Spacing**, and **Appearance**. Layout includes existing size constraints, direction, alignment, distribution, and wrapping. Spacing includes existing padding, margin, and gap attributes. Numbers use pixels. CSS lengths and percentages are also accepted. Padding and margin accept one to four values, such as `8 16` or `8px 16px`.

Use **Undo draft change** to undo an edit or **Discard** to return the previews to their source values. Drafts save locally per project and restore when you reenter Edit app, including after an editor reload. **Done editing** leaves the draft intact. Workspace Save remains separate from design drafts.

Click **Apply to code** to write the pending draft. The local source adapter checks each file's digest and attribute address, validates the complete batch in a staged project with the pinned Exact compiler, then replaces the changed files. An invalid or conflicting batch leaves the source unchanged. External source changes block Apply until you discard the stale draft. Applying Contract changes may trigger Exact's normal rebuild and state checkpoint restore. The editor keeps the preview frame mounted and restores selection after the new plan arrives. Source edits remain on disk after leaving the editor. Draft undo does not undo an applied batch. Use source control to revert committed source changes.

The design model, preview renderer, and code writer have separate interfaces. `tools/design-drafts.ts` owns source bindings, property patches, draft history, and checked batch translation. `tools/design-preview-client.js` renders those patches through temporary CSS. The compiler's source map identifies the affected sites, including repeated components and shared-style uses. Matching CSS class names alone would be unsafe because Exact deduplicates identical styles. `tools/preview-channel.ts` pushes selection and spacing feedback to the editor independently of source inspection. A canvas click can reveal its layer before its editable source rows finish loading.

Editing supports local Exact dev servers with the `tamber/1` editing API. Its local write token stays in the helper's memory. Release builds and remote servers cannot be edited. Layout controls require an existing literal attribute in the app's own Contract source or a shared style. Responsive expressions, token-based layout values, inherited values, package sources, text content, and attributes without a source address remain in the source editor. This version changes existing attributes; adding new layout rules or restructuring elements is not implemented. Typography controls appear only if Exact offers that property as an editable source row.

## Edit a screen

Select a layer on the canvas or in the left panel. Drag it to move it, or drag its lower-right handle to resize it. The inspector edits dimensions, color, corner radius, and text. Fixed width preserves a layer’s width across variants. Fill preserves its left and right insets, so it grows or shrinks with the frame. Switching modes preserves the layer’s current visible width. Text wraps within its configured height; increase that height to show more lines.

The bottom toolbar adds rectangles, text, and buttons. Use the pan tool or scroll the trackpad to move around. Pinch to zoom. Click the percentage to fit all screens.

The workspace saves automatically after changes, including the project connection, screen library, viewport sizes and positions, and active selection. Canvas pan, zoom, collapsed screen groups, and sidebar visibility also restore when you return. Reopen the same browser URL and port to use its local storage. Earlier saved documents load automatically. Save remains available to retry a failed write. App editing sessions reconnect after a reload. Saved design drafts restore when you enter Edit app.

The canvas and Preview use the same Exact components for editable layers. Preview buttons increment a small click counter to demonstrate interaction. Export opens the active viewport’s generated Contract source for copying. Export preserves Fill width rules instead of baking the active viewport width. The exported buttons have no action assigned; connect their behavior in your application.

Keyboard shortcuts: V selects, H pans, Command or Control+S saves, Command or Control+Z undoes, and Command or Control+Shift+Z redoes. Shortcuts leave text editing to focused inputs.

## Check a change

```sh
bun run test
bun run test:ui
bun run test:preview
bun run verify
bun run build
bun tools/demo.mjs test web
```

The preview-loading regression opens nine cold frames, reloads them, and restarts both the app server and the preview proxy while checking data and shared storage. The model and service tests cover hit testing, history, property validation, file migration, automatic persistence, ordered writes and recovery, export escaping, project routes, discovery, source editing, bridge boundaries, and source-verified selection restoration. Layout tests run the real compiler and cover UTF-8 addresses, expressions, validation failure, conflicts, undo, and path boundaries. The interaction tests cover edits, undo, creation, deletion, automatic restoration across a reload, canvas pan and zoom, live preview, canvas dragging, resizing, project connections, grouped screen variants, discovery, layer collapse, parent navigation, and selection retention. `bun run test:ui` and `bun run verify` start the helper and an isolated fixture on ports 5175 and 5176; stop the editor before running them.

## Current scope

The editor and editable screen content use Exact Contract components. Canvas 2D draws frame labels and selection handles. Connected apps run in browser frames at independent viewport sizes. A small TypeScript document model owns edits and history. It does not yet depend on OpenPencil.

Each screen has a flat layer list shared by its viewport variants. Existing single-screen documents migrate when opened. Editable layers support fixed and fill widths with normal text wrapping. They retain absolute vertical positions and explicit heights; automatic vertical flow and nested layout are not implemented. Text is edited in the inspector. Contract export uses absolute positioning. Connected apps use their own responsive layout and support source-backed appearance, layout, and spacing edits. Structural source editing, multi-selection, code import, image layers, and Figma files are not implemented.

Browser execution is tested. Native macOS and iOS builds have not been qualified. Large documents and advanced text layout also need performance and fidelity testing.

Source files:

- `studio/app.contract`: editor UI and pointer interactions.
- `studio/app.ts`: Exact data sources and local persistence.
- `studio/persistence.ts`: workspace restoration and ordered automatic saves.
- `studio/model.ts`: document model, editing commands, and Contract export.
- `studio/render.ts`: canvas labels and selection handles.
- `studio/workspace.ts`: screens, viewports, responsive geometry, and live app URLs.
- `studio/project.ts`: project URL and screen route validation.
- `studio/discovery.ts`: Exact route manifest validation and screen names.
- `tools/discovery-server.ts`: the local manifest reader.
- `tools/preview-screens.ts`: workspace preview subscriptions and measured frame sizes.
- `tools/full-page-client.js`: full-page presentation and live content measurement.
- `tools/event-stream.ts`, `tools/event-stream-client.js`: preview event transport without persistent HTTP connections.
- `tools/design-session.ts`: local inspection, design drafts, and explicit Apply.
- `tools/design-drafts.ts`: design patches, draft history, source-map targets, and batch code translation.
- `studio/draft-storage.ts`: per-project draft persistence.
- `tools/design-preview-client.js`: temporary preview CSS.
- `tools/preview-channel.ts`: immediate selection and spacing feedback.
- `tools/layout-source.ts`: source addresses and staged compiler validation.
- `tools/element-bridge.ts`, `tools/element-bridge-client.js`: local live-preview inspection and rendered element navigation.
- `examples/responsive`: a running Exact app for viewport comparisons.
- `studio/app.tamber`: editor theme.

The UI checks pass at normal text sizes in light and dark modes. The editor chrome currently uses compact fixed type sizes; full support for enlarged system text remains unfinished.
