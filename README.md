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

Click + beside Screens to name a screen and choose its first viewport. With a project connected, choose a project route or a blank editable screen. The sidebar groups viewport variants under each screen; click the screen name to collapse or expand the group. Select a viewport in the sidebar or click its canvas title to edit its screen name and dimensions. Drag the title to move the frame; drag the lower-right handle to resize it. Moving frames snap to nearby edges, centers, and an 80-pixel gap beside other frames. Pink guides show the alignment or spacing. Hold Option/Alt while dragging to ignore snapping. A completed drag is one undo step.

The inspector separates shared Screen settings (name and route) from the selected Viewport. Choose its preset from the dropdown, or enter Width and Height for a custom size. Use Add viewport to reveal phone, tablet, and desktop options that create another linked frame. Layer edits apply to every viewport of that screen. Duplicate screen creates an independent copy of the content. Deleting the last viewport of a screen removes that screen; the final viewport in the workspace cannot be deleted. Undo restores deleted content.

New screens appear below the existing frames. Viewport variants appear to the right, and the canvas fits new frames into view. Click a sidebar entry to focus a viewport, or the zoom percentage to fit all screens.

## Connect a running Exact app

Run the editor with `bun run dev` and open `http://127.0.0.1:5173/`. In your Exact app directory, start its dev server with this editor port allowed:

```sh
EXACT_TOOL_PORT=5173 bun exact.mjs web --port 5174
```

Click **Connect project** above Screens, give the project a name, and enter `http://127.0.0.1:5174`. The editor reads the app's route manifest automatically. Click + beside Screens, choose an available screen, and select its first viewport. The name and path fill in when you choose a screen; you can edit both before adding it. Routes already in the library are marked **Added**. Add phone, tablet, and desktop variants to compare each screen at independent viewport sizes. Exact's `exactViewport()` and responsive styles receive each frame's dimensions, regardless of canvas zoom.

Use **Refresh screens** in the Add screen form after adding routes to your app. A dynamic route such as `/note/:id` is marked **Set path**: replace the parameter with a real value, such as `/note/7`, before adding it. Discovery does not invent record IDs or open every route. You can always enter a name and route manually, including when the server is offline or has no manifest. Choose **Blank** for an editable screen.

Discovery reads the `routes.json` file produced by Exact's web build and dev server. The local helper makes this read because the app server does not allow the editor to fetch the manifest across browser origins. It only requests that file, does not follow redirects, and does not change the app's source. It omits fallback routes and merges duplicate paths. Refreshing the list never removes or changes screens already on the canvas.

Click the project name in the sidebar to change its server address. Every linked screen follows that change. Disconnect keeps the current preview URLs, and Undo restores the connection. Existing standalone Preview URLs still work; connecting a project adopts matching URLs into its route library. The inspector edits a linked screen's route or a standalone screen's Preview URL.

The canvas lets you arrange and resize frames. Use Preview to interact with the active app. Edit the connected app's Contract files in its repository; its dev server updates the frames. Clearing Preview URL restores that screen's editable layers. Export and layer tools are disabled while a screen is connected.

Exact's dev server restricts framing to its configured tool origin. Use `127.0.0.1` for the editor URL and restart the app server with `EXACT_TOOL_PORT` matching the editor port if a frame is blank. The app server must remain running. Other servers must allow embedding from the editor origin.

To try the included Exact example, run this in a second terminal:

```sh
bun run demo
```

Connect a project named Morrow at `http://127.0.0.1:5174`. The Add screen form discovers **Library** at `/` and **Note** at `/note`; choose either and add viewport variants. The example is a personal notebook with illustrated covers, search, collections, favorites, and an editor that saves notes locally. Cards use three columns on desktop, two on tablet, and one below 600 pixels. Light and dark themes follow the system setting. Each frame has its own running instance; browser storage remains shared by origin.

## Edit a screen

Select a layer on the canvas or in the left panel. Drag it to move it, or drag its lower-right handle to resize it. The inspector edits dimensions, color, corner radius, and text. Fixed width preserves a layer’s width across variants. Fill preserves its left and right insets, so it grows or shrinks with the frame. Switching modes preserves the layer’s current visible width. Text wraps within its configured height; increase that height to show more lines.

The bottom toolbar adds rectangles, text, and buttons. Use the pan tool or scroll the trackpad to move around. Pinch to zoom. Click the percentage to fit all screens.

Save writes the current document, project connection, and screen library to this app's local storage. Use the same development URL and port to reopen browser documents. Save is explicit; unsaved changes do not survive a reload.

The canvas and Preview use the same Exact components for editable layers. Preview buttons increment a small click counter to demonstrate interaction. Export opens the active viewport’s generated Contract source for copying. Export preserves Fill width rules instead of baking the active viewport width. The exported buttons have no action assigned; connect their behavior in your application.

Keyboard shortcuts: V selects, H pans, Command or Control+S saves, Command or Control+Z undoes, and Command or Control+Shift+Z redoes. Shortcuts leave text editing to focused inputs.

## Check a change

```sh
bun run test
bun run test:ui
bun run verify
bun run build
bun tools/demo.mjs test web
```

The model tests cover hit testing, history, property validation, file migration, export escaping, shared project routes, and discovery parsing and HTTP handling. The interaction tests cover edits, undo, creation, deletion, saving across a reload, live preview, canvas dragging, resizing, project connections, grouped screen variants, and discovery with refresh and failure recovery. `bun run test:ui` and `bun run verify` start the helper and an isolated manifest fixture on ports 5175 and 5176; stop the editor before running them.

## Current scope

The editor and editable screen content use Exact Contract components. Canvas 2D draws frame labels and selection handles. Connected apps run in browser frames at independent viewport sizes. A small TypeScript document model owns edits and history. It does not yet depend on OpenPencil.

Each screen has a flat layer list shared by its viewport variants. Existing single-screen documents migrate when opened. Editable layers support fixed and fill widths with normal text wrapping. They retain absolute vertical positions and explicit heights; automatic vertical flow and nested layout are not implemented. Text is edited in the inspector. Contract export uses absolute positioning. Connected apps use their own responsive layout. Editing their source through the inspector, multi-selection, code import, image layers, and Figma files are not implemented.

Browser execution is tested. Native macOS and iOS builds have not been qualified. Large documents and advanced text layout also need performance and fidelity testing.

Source files:

- `studio/app.contract`: editor UI and pointer interactions.
- `studio/app.ts`: Exact data sources and local persistence.
- `studio/model.ts`: document model, editing commands, and Contract export.
- `studio/render.ts`: canvas labels and selection handles.
- `studio/workspace.ts`: screens, viewports, responsive geometry, and live app URLs.
- `studio/project.ts`: project URL and screen route validation.
- `studio/discovery.ts`: Exact route manifest validation and screen names.
- `tools/discovery-server.ts`: the local manifest reader.
- `examples/responsive`: a running Exact app for viewport comparisons.
- `studio/app.tamber`: editor theme.

The UI checks pass at normal text sizes in light and dark modes. The editor chrome currently uses compact fixed type sizes; full support for enlarged system text remains unfinished.
