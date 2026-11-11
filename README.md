# Exact Design

A visual editor for Exact interfaces. Build a screen on the canvas, adjust its layers, preview real Exact controls, and export Contract source.

## Run the editor

Install Bun 1.4.2 and Rust through rustup. From this repository:

```sh
bun run setup
bun run dev
```

Open the URL printed by the development server. Use a desktop window at least 1000 pixels wide for both panels. On narrower windows, the panels hide to leave room for the canvas.

Setup downloads Exact at revision `336a059fd1464bee7c61640afb7124ebf276d06d` into the ignored `.exact-sdk` directory. Exact's setup command installs its toolchain requirements. The runtime is pinned because its APIs are still changing.

## Edit a screen

Select a layer on the canvas or in the left panel. Drag it to move it, or drag its lower-right handle to resize it. The inspector edits dimensions, color, corner radius, and text.

The bottom toolbar adds rectangles, text, and buttons. Use the pan tool or scroll the trackpad to move around. Pinch to zoom. Click the percentage to reset the viewport.

Save writes the current document to this app's local storage. Use the same development URL and port to reopen browser documents. Save is explicit; unsaved changes do not survive a reload.

Preview renders the screen using Exact elements. Preview buttons increment a small click counter to demonstrate interaction. Export opens the generated Contract source for copying. The exported buttons have no action assigned; connect their behavior in your application.

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

The document contains one fixed 720 × 520 screen with a flat layer list. Text is edited in the inspector. Contract export uses absolute positioning. Nested frames, auto layout, multi-selection, code import, image layers, and Figma files are not implemented.

Browser execution is tested. Native macOS and iOS builds have not been qualified. Large documents and advanced text layout also need performance and fidelity testing.

Source files:

- `studio/app.contract`: editor UI and pointer interactions.
- `studio/app.ts`: Exact data sources and local persistence.
- `studio/model.ts`: document model, editing commands, and Contract export.
- `studio/render.ts`: Canvas 2D rendering.
- `studio/app.tamber`: editor theme.

The UI checks pass at normal text sizes in light and dark modes. The editor chrome currently uses compact fixed type sizes; full support for enlarged system text remains unfinished.
