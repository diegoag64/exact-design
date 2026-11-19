# Changelog

Notable changes to Exact Design. Dated development entries summarize Git commit history, not versioned releases.

## Unreleased

### Added

- A collage arrangement for demos: add `layout=collage` to the studio's address, and **Tidy up** and setup links pack screens into columns so the workspace fits one view. Each screen's viewports stay side by side.
- Waymark, a second demo app: the companion app for an invented adventure game, with painted backdrops, a scrolling realm map, quests, rewards, badges and statistics. Start it with `bun run demo:waymark`. `bun tools/demo.mjs --app <name>` selects a demo, and Ember stays the default.
- **Lumen**, a finance example app: a personal finance app built with Exact, with Home, Activity, Cards, Budgets and Goals tabs, Send money, Add to a goal, Payment and Account sheets, and a Welcome screen. Its panels use Liquid Glass on iOS 26. Start it with `bun run demo:lumen` and open the printed setup link. Native previews recognize it.
- **Plan view** in the bottom toolbar (⇧P). Canvas previews become line plans: surfaces as outlines with their corners, text as bars that follow each wrapped line, icons and inline SVGs as their outlines, and photos as crossed boxes. Progress bars and rings keep a light tint so their values stay readable. Lines stay one pixel wide at every zoom. The plan uses paper and graphite in light mode and a blueprint in dark mode, following the screens' theme, and the setting is remembered. Selection, spacing labels and app editing work as usual.
- Plan view options, in the arrow beside the plan view button. **Layout boxes** (⇧B) outlines the rows, columns and other containers the app never paints. **Readable text** (⇧T) shows the app's own words in place of the bars. Both are remembered.
- An **Appearance** menu beside the zoom controls sets light or dark for the studio and, separately, for your app in canvas previews. Each can match the system, and both are remembered. Plan view follows the screens' choice.
- Regions. Shift-drag over a screen to measure everything inside the rectangle: padding, gaps and margins in the spacing colours, sizes, corner radius and the region's own size. Rows with the same structure are labeled once and marked ×N. **Copy** puts the region's spec on the clipboard as an outline of its layers. Alt+A measures the whole screen under the pointer, and Escape or a click outside clears the region. Regions work with or without plan view.
- Precise number editing. In the inspector, ↑ and ↓ step a value (Shift by 10, Option by 0.1) and keep its unit, dragging a field's letter or icon scrubs it, and math such as `16*2` evaluates on Enter. Canvas spacing labels can be dragged to adjust padding, margins and gaps.
- Hold Option (Alt) over another element to measure the distance from the selection to it, or to each edge of its parent.
- Theme colours in the inspector. Colour fields show the swatch of their theme token, such as `ember`. The swatch opens a picker that lists the app's theme colours first, with a custom value below, and raw colours that are not theme tokens are flagged.
- A 3×3 alignment grid for flex containers that sets both axes as one change, and Hug, Fill and Fixed sizing for width and height.
- Native iOS previews. The **Native preview** drawer shows the selected screen as the app's native build renders it in the iOS Simulator, with its UIKit tab bar, sheets and Liquid Glass controls, on iPhone SE, iPhone 17, iPhone 17 Pro Max or iPad Pro 11 in light or dark appearance. Open it from the bottom toolbar, the screen's inspector or the canvas context menu. The canvas keeps the editable web frames, so you can edit the app with the drawer open. **Refresh** builds the app when its source changed, opens the route through its deep link and captures it; **Refresh all** captures every connected screen whose screenshot is missing or stale. While it works, the drawer lists the build, simulator and capture steps with a timer, the crate being compiled, capture progress, and the last build's duration. It notes when unapplied draft edits are not yet in the native build, and shows stale screenshots and errors such as missing Xcode or low disk space. Refreshes keep the app running between captures and reuse current screenshots and builds.
- **Test remotely** on [Expo Simulators](https://docs.expo.dev/eas/simulators/) from the Native preview drawer. Connect an Expo access token once per project. Then one click builds your latest saved code, starts a cloud iPhone, uploads the app and opens the selected screen. **Open in Simulator** then shows the selected screen on the running iPhone in a new tab, in a few seconds, and uploads a new build first when your code changed. Sessions stop with **Stop**, after 15 idle minutes, or when the studio stops.
- Ember opens any route from a `web+ember://` link, and the first native build records its iOS host in `app.json`.
- Setup links accept `show`, a list of screen names or routes that start visible. The link still adds every screen, but the others start hidden and don't load their previews. The Ember link printed by `bun run demo` shows Today, Welcome and Onboarding Goal.
- An MIT license and open-source project files: a contributing guide, a security policy, a code of conduct, issue forms, and a pull request template with before-and-after screenshots.
- Tooltips for every icon button. They appear quickly on hover or keyboard focus, show the keyboard shortcut, and explain what the button does.
- Hide screens and individual viewports with the eye button that appears when you hover a row in the Screens panel, or from a viewport's context menu. Hidden frames leave the canvas, stop loading their previews, and are skipped by hit testing, snapping, and **Fit all screens**. Visibility is saved with the workspace and can be undone.
- A loading veil over the canvas when the page opens. It hides the canvas from the first frame, counts live previews as they render, then fades out so the screens appear together. Fast loads show only the empty canvas, workspaces without visible live previews skip it, a click or **Edit app** dismisses it, it leaves on its own if loading stalls, and it never returns after the first load.
- **Reduce preview effects** beside the zoom controls. Canvas previews omit backdrop blur at every zoom and skip CSS animations, which keeps the GPU nearly idle while the canvas is still. Full-screen Preview is unchanged, and the setting is remembered.

### Changed

- Compress Waymark artwork to WebP at its original dimensions, with lossless ornaments and transparency. Art regeneration includes the compression step.

- Upgrade the pinned Exact SDK from `114bb88f` to `32f79aa8`. Migrate theme files and the local editing protocol from Tamber to Forma, including compiler validation and preview fixtures. The SDK now uses Rust 1.99.1 and includes web transform-layer promotion, navigation fixes, and native rendering updates. Connected apps must use the Forma editing API.

- While editing an app, Escape clears the selected element, from the canvas or the studio, and inspection continues. With nothing selected, Escape finishes editing. The inspector also has a **×** beside the selected element's name.

### Fixed

- Selected and active controls keep their colour on hover. The active toolbar tool, selected icon buttons, selected layer and screen rows, timeline points and selected segments no longer turn the neutral grey under the pointer. Hover shades the selected colour instead, pressing shows a deeper shade with readable text, and a selected segment gains an edge. Pressing a row or timeline point no longer fades its text. Keyboard focus on a tool adds a band in the panel colour inside the ring, so it stays visible on the blue fill. A keyboard-focused menu row has a ring that sets it apart from the row under the pointer, and menu shortcuts are easier to read.
- Setup links fetch current screens when another app takes over the same local server URL, instead of reusing the previous app’s cached screens.

- Grouped draft edits roll back on failure and undo both alignment axes even at the history limit. Number scrubbing preserves valid negative values, alignment follows reversed flows, and Fixed sizing accounts for padding and borders.

- The inspector's **Flow** shows the direction an element renders when its source leaves `flex-direction` unset. A button or row laid out as a row read as Column.
- Draft previews of a theme colour named like a CSS colour keyword, such as `AccentColor`, show the theme's value. The preview showed the browser's system accent instead.
- Clicking the selected element again no longer hides its spacing overlay.
- Every gap in a selected flex container now shows its value on the canvas, not just the largest one. Hovering any gap highlights all the gaps that share that value. While you edit one, the others show the new value as you type, and the tooltip says how many gaps it changes.

- Native refreshes retain the pre-build source signature, retry failed Xcode checks, and serialize jobs across projects. Shutdown waits for accessibility cleanup and skips queued work. Projects sharing a bundle ID reinstall the correct build when switching. Capture errors keep the previous screenshot visible and show details in the inspector.
- Windows setup now points to the supported Ubuntu/WSL2 workflow and rejects native execution before starting SDK builds or the helper.
- Preserve resource identity across launches while still passing the page timestamp to the data sources. Loading-indicator frames use stable keys, and spacing labels and draft-count badges scale with browser text settings.

- `bun run setup` now builds the Contract compiler. On a fresh clone, Apply and the source-writing tests failed until it had been built some other way.
- Prevent a tooltip popover error when focus returns to a control as a context menu closes.

- Two studio pages open at once, such as two tabs, no longer overwrite each other's preview readiness, sizes, and editing state. Each page now scopes its frame ids.
- Refresh selection outlines after spacing drafts change or are removed, including repeated elements shifted by padding or gaps.
- Reduced canvas layout and label-measurement work during pan and zoom, and kept live previews on compositor layers as the camera moves. Overview navigation with many visible previews remains limited by browser rendering.

### Changed

- Spacing overlays are colored by kind: green padding, dashed orange margin, and hatched magenta gaps. Padding, Margin and Gap rows in the inspector show a matching color dot. The selected element's margins now appear on the canvas and can be edited there like padding.
- Upgrade the Exact SDK from `336a059f` to `114bb88f`, including upstream fixes for development reloads, canvas rendering, and native builds. Adapt shared previews to the SDK's split runtime bundles so controls and data still synchronize across viewports.
- Screen discovery no longer lists a protocol handler's landing route, such as Ember's `/open`, as a screen.
- `test:ui` and `verify` now use isolated source copies and private ports, preserving running studio sessions and retaining verification logs.
- Below 15% zoom, live canvas previews omit backdrop blur, which is only a few pixels wide at that size. Idle and pan with many visible previews no longer re-render each blur on every frame.
- Shortened the root README and separated usage and development documentation.
- Added repository-wide agent instructions, PR title and description requirements, a PR template, and a changelog maintenance convention.

## 2026-11-12 development

### Added

- Device presets and sets for phone, tablet, and desktop comparisons.
- **Add all** for discovered routes, **Tidy up** for frame arrangement, and setup links that connect a project and add its screens.

### Fixed

- Frame loading and automatic layout as previews load.
- Modal previews retain their device height.

Changes: [PR #3](https://github.com/diegoag64/exact-design/pull/3).

## 2026-11-11 development

### Added

- Local app inspection, a Layers tree, and source-backed layout, spacing, appearance, and literal text edits.
- Persistent design drafts with live previews, explicit Apply, source conflict checks, and compiler validation.
- Draft review grouped by file, with individual change reverts.
- Linked property controls, property additions, explicit expression overrides, and a persistent design timeline.
- Workspace autosave, automatic preview height, shared app state, and a shared preview connection.
- Linked hover highlights across viewports of the same page.
- Ember, the calorie and activity tracker demo. Morrow remains a test fixture.

### Changed

- Rebuilt the studio around Figma's UI3 layout with shared controls, semantic tokens, Lucide icons, and context menus.
- Organized inspector properties and added timeline action icons.

### Fixed

- Canvas navigation during app inspection and offscreen layer selection.
- Inspector identity and selection restoration after preview reloads.
- App data stalls across multiple previews.

Changes: [development commits](https://github.com/diegoag64/exact-design/compare/01f0b6d...38a2e10), including [PR #2](https://github.com/diegoag64/exact-design/pull/2).

## 2026-11-10 development

### Added

- Initial canvas editor with editable layers, undo, and Contract export.
- Multiple screens, linked viewports, responsive width constraints, and frame snapping.
- Live app previews, project connections, named routes, and route discovery.
- Persistent sidebar visibility controls.

History: [initial development commits](https://github.com/diegoag64/exact-design/commits/01f0b6d).
