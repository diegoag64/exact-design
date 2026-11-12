# Studio design system

The studio uses compact, neutral panels around an unobstructed canvas. Blue identifies selection and primary actions; pink identifies spacing measurements. App previews retain their own appearance. The shell supports light and dark system themes.

## Source of truth

| File | Responsibility |
| --- | --- |
| `studio/app.tamber` | Semantic colors, typography, radii, and elevation |
| `studio/ui.contract` | Shared styles, controls, and panel widths |
| `studio/icons.contract` | Generated inline Lucide icon component |
| `studio/assets/lucide/` | Pinned Lucide 1.72.0 SVG sources and ISC license |
| `studio/modules/web/menus.js` | Browser menu focus and keyboard navigation |
| `studio/modules/web/canvas-navigation.js` | Browser gestures and validated iframe input |
| `studio/app.contract` | Feature composition, selection, and camera state |

The Exact Contract owns view state and actions. Browser hatches handle browser-specific input and focus. They invoke existing controls or dispatch canvas input; they do not maintain a second document or camera model.

## Tokens and dimensions

| Role | Tokens / values |
| --- | --- |
| Surfaces | `surface.panel`, `surface.field`, `surface.canvas` |
| Interaction | `surface.hover`, `surface.pressed`, `surface.selected`, `surface.action` |
| Text and icons | `ink.primary`, `ink.secondary`, `ink.muted`, `ink.selected`, `ink.on-action`, `ink.danger` |
| Boundaries | `line.subtle`, `line.strong` |
| Accent | `accent`, also used by canvas selection outlines |
| Typography | `type.body` 12px, `type.caption` 11px, `type.heading` 13px |
| Corners | `radius.control` 4px, `radius.panel` 8px, `radius.menu` 10px |
| Elevation | `shadow.menu`, reserved for floating controls and menus |
| Panel widths | `screensWidth()` 240px, `inspectorWidth()` 260px |
| Control sizes | 32px tool buttons, 30px fields, 28–32px tree rows |
| Spacing | 4px increments; 8px control gaps, 12px section gaps, 16px section padding |

Panel geometry and camera calculations read the same width helpers. Dense tool typography is fixed-size for now; support for larger text remains a separate accessibility task. The canvas renderer uses the fixed `#0d99ff` accent because its drawing API does not resolve Tamber tokens.

## Components

Import components and styles from `./ui.contract`; import `Icon` from `./icons.contract`. Exact props are explicit: the compiler does not support prop defaults.

| Primitive | Use |
| --- | --- |
| `Icon` | `name`, `size`, `angle`; inherits the enclosing control's text color |
| `IconButton` | Labeled tool button with selected, disabled, hint, shortcut, and test ID props |
| `PropertyField` | Caption and input with a descriptive accessible label |
| `SectionHeading` | Consistent compact inspector heading |
| `MenuItem` | Action, optional icon and shortcut hint, disabled/destructive state, closing menu target |
| `MenuDivider` | Separation between groups of related actions |
| `Tool` | Custom button compositions using the standard hit area and interaction states |
| `Field` | Native text inputs and selects; Exact owns their focus behavior |
| `TreeRow` | Layer row hover and keyboard focus treatment |
| `InspectorValue` | Single compound-value field with an inline All/Both identifier |
| `PanelSection` | Padding, vertical rhythm, and divider for inspector groups |
| `Menu` | Popover surface, width, border, radius, and elevation |

```contract
IconButton(icon="hand", label="Pan", hint="Pan (H) · Hold Space to pan",
  shortcut="h", selected=hand, disabled=false, testId="hand-tool", press=handTool)

PropertyField(label="X", accessibleLabel="X position", value=`${node.x}`,
  testId="position-x", change=moveX)
```

Use accessible labels for icon-only controls and descriptive names for fields. A tooltip supplements the label. Disable actions that are temporarily unavailable; omit operations the tool does not implement. Do not add decorative eyebrows, placeholder tabs, or buttons that cannot perform an action.

## Icons

[Lucide](https://lucide.dev/) supplies every studio glyph under its [ISC license](https://lucide.dev/license). The vendored subset has no network or runtime package dependency. `bun run icons` regenerates `icons.contract` from those SVGs. The generator combines each icon into one path so tree rows do not create a branch for every icon in the set.

Icons use a 24-unit viewBox, a 1.75-unit stroke, and a 16px box; tree glyphs use 14px. Controls center the box with flex layout. Inline paths use `currentColor`, including selected and disabled states. Do not render monochrome UI icons through an external SVG image: the image document cannot inherit the enclosing button's color.

## Canvas interaction

| Input | Behavior |
| --- | --- |
| Trackpad / wheel | Pan without selecting or moving app elements |
| Pinch / Ctrl or Command + wheel | Zoom around the pointer |
| H / V | Pan / Select tool |
| Hold Space and drag | Temporary Pan throughout the studio, including app editing |
| Release Space during a drag | Finish the drag before restoring the previous tool |
| Middle-mouse drag | Pan without changing tools or selection |
| Shift+1 | Fit all screens |
| Shift+2 | Fit the active screen, or selected local layer |
| Click a screen in the sidebar | Smoothly pan to its top; keep zoom unchanged |
| Select an offscreen app layer | Move the canvas camera just enough to reveal it |

Text entry keeps its own keys. Source apps receive their normal input in Preview mode. Canvas iframe gestures are accepted only from a registered window inside the canvas with the expected origin and `__ed_canvas=1`. Input ownership survives native inspection ending or restarting; full-screen Preview uses `__ed_canvas=0`. Camera updates remain in the Contract and persist through the existing workspace storage.

## Context menus

Canvas and tree rows share the `studio-menu` popover. Right-clicking a tree row first selects that row. Canvas hit testing uses the camera coordinates. App inspection offers parent selection, draft undo, finish editing, viewport navigation, and panel actions. Local screens additionally offer duplication, viewport variants, and deletion. Unsupported source restructuring commands are omitted.

Exact owns placement, viewport-edge fitting, action dismissal, and click-away dismissal. The browser menu adapter focuses the first enabled item and supports Up/Down, Home/End, type-ahead, Enter, and Escape. Closing returns focus without scrolling the canvas. Menus preserve native editing behavior inside text fields.

## Linked hover

Canvas and layer-tree hover use one active target per connected project. Viewports match by route, query, hash, compiled plan, source site, and repeated-item identity. Internal preview parameters do not distinguish pages. Hidden elements, ambiguous matches, and other routes receive no outline. Hover never changes selection or creates timeline entries.

The preview bridge pushes matching targets to each viewport. Each frame draws its outline from its own element bounds. Pointer exit, cancellation, focus loss, panning, and edit-session closure clear hover. A late leave from a previous viewport cannot clear the current viewport's hover. Source-page reloads invalidate the target; new matching viewports receive the current target.

Exact's native pointer gate runs after the studio's hover handler. The local proxy exposes a read-only instance-table warmup from the pinned inspector module, so repeated items resolve before the first selection. No SDK or application files are changed.

## Design inspector

Properties are grouped into collapsible Position, Layout, Spacing, Text, Typography, Appearance, Fill, Stroke, and Effects sections. Dimensions and typography metrics use paired fields. The source adapter in `tools/inspector-fields.ts` supplies property names, groups, and compound-field metadata; the view does not infer source semantics from displayed labels.

Padding and margin follow Top, Right, Bottom, Left order. Border radius follows Top left, Top right, Bottom right, Bottom left. Gap uses Row and Column. A selected chain control means one value updates every edge or axis. Unlinking exposes independent fields; editing one preserves the others. Linking unequal values uses the first value, as its tooltip explains. Each edit remains one draft operation and one undo step.

Linking values is separate from sharing source. The layers icon identifies a shared style. A repeated template shows its instance count beneath the selected element. Source locations remain visible on the selection and available on property tooltips. Dynamic and responsive style expressions stay read-only until the user chooses **Override**. That action stages a static value and records the original expression in the timeline; inspection alone never freezes responsive behavior. Package-owned sources and data-bound text remain read-only.

Common controls appear even when no attribute is written on the element. Editing an unset value adds a local source attribute. **Add property** exposes additional sizing, flex, grid, positioning, and visual settings from `tools/property-catalog.ts`; choosing one stages its default value. X and Y become editable after choosing a positioning mode such as Relative or Absolute. Opacity accepts percentages. Flow and alignment use labeled icon controls.

Source adapters distinguish literal replacement, new inline attributes, and explicit expression replacement. `tools/source-properties.ts` locates complete values and safe insertion points without evaluating expressions. Additions at the same source location are grouped into a single formatted insertion. Every Apply checks file digests and validates the entire batch with the pinned compiler before writing. Unsupported or ambiguous source locations are not offered as writable controls.

Background polling does not set write-busy state, fade draft actions, or refresh the timeline. Actual write responses clear write-busy state; successful journal changes refresh history. Transient request errors preserve the last inspector result while reporting the error.

Literal text uses a multiline Content field. Preview text overrides preserve the runtime's underlying text and restore it on undo or discard. Source writes escape the literal, validate the batch, and check the file digest. Text bound to application data remains read-only here.

## Design timeline

The Timeline toolbar button opens a horizontal sequence of edits. Each point uses an icon for its operation or edited property. Selecting it shows the action, element, author, time, source address, and before/after values. `studio/history-icons.ts` derives icons from event metadata, so older saved entries gain the same treatment. Opening history does not rewind the live design. Closing it restores the full canvas area.

`studio/design-history.ts` persists an append-only journal in `app:/data/design-history.json`. Entries have an ID, parent ID, timestamp, project, actor (`user` or `ai`), operation kind, target, structured changes, and before/after state. The current manual editor records `user`; the actor field supports a later AI command adapter. There is no AI editing endpoint yet.

Source events include draft edits, undo, discard, and Apply to code. Workspace events include screen-library changes, geometry, local layer properties, creation, deletion, undo, and redo. Pointer movement is committed as one geometry edit. Selection, hovering, camera movement, and no-op writes create no entries. History is scoped by the connected project origin, like saved drafts, and survives editor and helper restarts in the same browser storage.

Workspace events retain document snapshots. Source events retain draft patches, original values, source addresses, and file hashes. These are comparison evidence, not full source-repository or application-state snapshots. Point comparison, branching, replay, and rollback of applied code are not implemented. Undoing or discarding a draft adds an event rather than removing its earlier history.

## Verification

- `bun run test`: source editing, persistence, selection, geometry, and proxy tests.
- `bun run test:ui`: Exact behavior tests, including camera coordinates and context actions.
- `bun run test:preview`: isolated real-browser tests. The studio regression covers icon tint and centering in both themes, right-click targeting, keyboard focus, edge placement, Space and middle dragging, and typing. The real-app regressions cover menus and navigation across inspected iframe boundaries, literal text editing, independent padding and corners, linked values, checked source writes, timeline persistence, property additions, explicit responsive overrides, and stable controls during background polling.
- `bun run verify`: the required Exact layout and behavior audit.

New controls use these primitives and add behavior tests where they introduce interaction or state. Changes to tokens apply to all consumers; feature-specific source editing belongs outside the component library.
