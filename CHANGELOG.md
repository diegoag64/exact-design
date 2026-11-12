# Changelog

Notable changes to Exact Design. Dated development entries summarize Git commit history, not versioned releases.

## Unreleased

### Fixed

- Reduced canvas layout and label-measurement work during pan and zoom, and kept live previews on compositor layers as the camera moves. Overview navigation with many visible previews remains limited by browser rendering.

### Changed

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
