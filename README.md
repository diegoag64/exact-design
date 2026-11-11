# Exact Design

A visual editor for Exact interfaces. Arrange screens and linked viewport variants on one canvas, adjust their layers, preview Exact controls, and export Contract source.

## Run the editor

Install Bun 1.4.2 and Rust through rustup. From this repository:

```sh
bun run setup
bun run dev
```

Open the URL printed by the development server. Use a desktop window at least 1000 pixels wide for both panels. On narrower windows, the panels hide to leave room for the canvas.

Setup downloads Exact at revision `336a059fd1464bee7c61640afb7124ebf276d06d` into the ignored `.exact-sdk` directory. Exact's setup command installs its toolchain requirements. The runtime is pinned because its APIs are still changing.

## Arrange screens

Click + beside Screens to add a blank screen. Select a screen in the sidebar or click its canvas title to edit its name and viewport dimensions. Drag the title to move the frame; drag the lower-right handle to resize it.

Use Add viewport in the inspector to create a linked phone, tablet, or desktop variant. Layer edits apply to every viewport of that screen. The preset buttons above it resize the selected viewport. Duplicate screen creates an independent copy of the content. Deleting the last viewport of a screen removes that screen; the final viewport in the workspace cannot be deleted. Undo restores deleted content.

New frames appear to the right, and the canvas fits them into view. Click a sidebar entry to focus a viewport, or the zoom percentage to fit all screens.

## Edit a screen

Select a layer on the canvas or in the left panel. Drag it to move it, or drag its lower-right handle to resize it. The inspector edits dimensions, color, corner radius, and text.

The bottom toolbar adds rectangles, text, and buttons. Use the pan tool or scroll the trackpad to move around. Pinch to zoom. Click the percentage to fit all screens.

Save writes the current document to this app's local storage. Use the same development URL and port to reopen browser documents. Save is explicit; unsaved changes do not survive a reload.

Preview renders the active viewport using Exact elements. Preview buttons increment a small click counter to demonstrate interaction. Export opens the active viewport’s generated Contract source for copying. The exported buttons have no action assigned; connect their behavior in your application.

Keyboard shortcuts: V selects, H pans, Command or Control+S saves, Command or Control+Z undoes, and Command or Control+Shift+Z redoes. Shortcuts leave text editing to focused inputs.

## Check a change

```sh
bun test studio/model.test.ts
bun run test:ui
bun run verify
bun run build
```

The model tests cover hit testing, history, property validation, file validation, and export escaping. The interaction tests cover edits, undo, creation, deletion, saving across a reload, live preview, canvas dragging, and resizing.

## Current scope

This first version uses Exact Contract for the editor UI and Exact Canvas 2D for the canvas. A small TypeScript document model owns edits and history. It does not yet depend on OpenPencil.

Each screen has a flat layer list shared by its viewport variants. Existing single-screen documents migrate when opened. Viewport bounds clip content; layers retain absolute coordinates and do not yet reflow across widths. Text is edited in the inspector. Contract export uses absolute positioning. Live Exact project rendering, responsive layout, nested frames, multi-selection, code import, image layers, and Figma files are not implemented.

Browser execution is tested. Native macOS and iOS builds have not been qualified. Large documents and advanced text layout also need performance and fidelity testing.

Source files:

- `studio/app.contract`: editor UI and pointer interactions.
- `studio/app.ts`: Exact data sources and local persistence.
- `studio/model.ts`: document model, editing commands, and Contract export.
- `studio/render.ts`: Canvas 2D rendering.
- `studio/app.tamber`: editor theme.

The UI checks pass at normal text sizes in light and dark modes. The editor chrome currently uses compact fixed type sizes; full support for enlarged system text remains unfinished.
