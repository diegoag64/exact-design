# Changelog

Notable changes to Exact Design. Dated development entries summarize Git commit history, not versioned releases.

## Unreleased

### Added

- Native iOS frames. The **Native iOS** viewport set adds iPhone SE, iPhone 17, iPhone 17 Pro Max and iPad Pro 11 frames that show the app's native build running in the iOS Simulator, with its UIKit tab bar, sheets and Liquid Glass controls. **Refresh all native previews** builds the app when its source changed, opens each route through its deep link, and captures the frames whose screenshot is missing or stale, and **Refresh preview** captures one frame again; frames show progress, stale screenshots and errors such as missing Xcode or low disk space. Native frames are read-only screenshots. Refreshes keep the app running between captures and reuse current screenshots and builds.
- Ember opens any route from a `web+ember://` link, and the first native build records its iOS host in `app.json`.

- Setup links accept `show`, a list of screen names or routes that start visible. The link still adds every screen, but the others start hidden and don't load their previews. The Ember link printed by `bun run demo` shows Today, Welcome and Onboarding Goal.
- An MIT license and open-source project files: a contributing guide, a security policy, a code of conduct, issue forms, and a pull request template with before-and-after screenshots.
- Tooltips for every icon button. They appear quickly on hover or keyboard focus, show the keyboard shortcut, and explain what the button does.
- Hide screens and individual viewports with the eye button that appears when you hover a row in the Screens panel, or from a viewport's context menu. Hidden frames leave the canvas, stop loading their previews, and are skipped by hit testing, snapping, and **Fit all screens**. Visibility is saved with the workspace and can be undone.
- A loading veil over the canvas when the page opens. It hides the canvas from the first frame, counts live previews as they render, then fades out so the screens appear together. Fast loads show only the empty canvas, workspaces without visible live previews skip it, a click or **Edit app** dismisses it, it leaves on its own if loading stalls, and it never returns after the first load.
- **Reduce preview effects** beside the zoom controls. Canvas previews omit backdrop blur at every zoom and skip CSS animations, which keeps the GPU nearly idle while the canvas is still. Full-screen Preview is unchanged, and the setting is remembered.

### Fixed

- Windows setup now points to the supported Ubuntu/WSL2 workflow and rejects native execution before starting SDK builds or the helper.
- Preserve resource identity across launches while still passing the page timestamp to the data sources. Loading-indicator frames use stable keys, and spacing labels and draft-count badges scale with browser text settings.

- `bun run setup` now builds the Contract compiler. On a fresh clone, Apply and the source-writing tests failed until it had been built some other way.
- Prevent a tooltip popover error when focus returns to a control as a context menu closes.

- Two studio pages open at once, such as two tabs, no longer overwrite each other's preview readiness, sizes, and editing state. Each page now scopes its frame ids.
- Refresh selection outlines after spacing drafts change or are removed, including repeated elements shifted by padding or gaps.
- Reduced canvas layout and label-measurement work during pan and zoom, and kept live previews on compositor layers as the camera moves. Overview navigation with many visible previews remains limited by browser rendering.

### Changed

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
