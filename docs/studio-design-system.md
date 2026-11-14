# Studio design system

The studio follows Figma's UI3 layout: two full-height panels around an unobstructed canvas, with no top bar. The left panel opens with the project header; the right panel opens with the document actions. Floating chrome — the tool bar, zoom control, status toast, and collapsed-panel headers — sits on the canvas. Blue identifies selection and primary actions; pink identifies spacing measurements. App previews retain their own appearance. The shell supports light and dark system themes.

## Source of truth

| File | Responsibility |
| --- | --- |
| `studio/app.tamber` | Semantic colors, typography, radii, and elevation |
| `studio/ui.contract` | Shared styles, controls, and panel widths |
| `studio/icons.contract` | Generated inline Lucide icon component |
| `studio/assets/lucide/` | Pinned Lucide 1.72.0 SVG sources and ISC license |
| `studio/modules/web/menus.js` | Browser menu focus and keyboard navigation |
| `studio/modules/web/tooltips.js` | Hover and keyboard-focus tooltips for `data-tip` |
| `studio/modules/web/canvas-navigation.js` | Browser gestures and validated iframe input |
| `studio/app.contract` | Feature composition, selection, and camera state |

The Exact Contract owns view state and actions. Browser hatches handle browser-specific input and focus. They invoke existing controls or dispatch canvas input; they do not maintain a second document or camera model.

## Tokens and dimensions

| Role | Tokens / values |
| --- | --- |
| Surfaces | `surface.panel`, `surface.field`, `surface.raised` (selected segment), `surface.canvas`, `surface.notice` (pending drafts, info tiles) |
| Interaction | `surface.hover`, `surface.pressed`, `surface.selected`, `surface.action` |
| Review diffs | `surface.diff-add` / `ink.diff-add`, `surface.diff-remove` / `ink.diff-remove` |
| Text and icons | `ink.primary`, `ink.secondary`, `ink.muted`, `ink.selected`, `ink.on-action`, `ink.danger` |
| Boundaries | `line.subtle`, `line.strong` |
| Accent | `accent`, also used by canvas selection outlines |
| Typography | `type.body` 12px, `type.caption` 11px, `type.heading` 13px, `type.mono` 11px for source, routes, and diffs |
| Corners | `radius.control` 5px, `radius.panel` 8px, `radius.menu` 12px (menus, dialogs, floating bars) |
| Elevation | `shadow.menu` for menus and dialogs, `shadow.toolbar` for floating bars, `shadow.raised` for selected segments |
| Panel widths | `screensWidth()` 240px, `inspectorWidth()` 260px |
| Control sizes | 48px panel headers, 40px section title rows, 32px tool buttons, 28px fields, buttons, and tree rows, 24px section actions |
| Spacing | 4px grid. Panel sections pad 12px top, 16px left and bottom, 12px right; 8px between controls, 10px between inspector properties, 1px between tree rows. Tree rows indent 12px per level |

Panel geometry and camera calculations read the same width helpers. Spacing labels and draft-count badges use `rem` sizes and grow with the browser's text size. Most dense tool typography still uses fixed-size tokens; broader support for larger text remains a separate accessibility task. The canvas renderer uses the fixed `#0d99ff` accent because its drawing API does not resolve Tamber tokens.

## Components

Import components and styles from `./ui.contract`; import `Icon` from `./icons.contract`. Exact props are explicit: the compiler does not support prop defaults.

| Primitive | Use |
| --- | --- |
| `Icon` | `name`, `size`, `angle`; inherits the enclosing control's text color |
| `IconButton` | Labeled 32px tool button with selected, disabled, hint, shortcut, and test ID props |
| `ToolbarButton` | Floating-toolbar tool; the active tool is filled with the action colour |
| `SmallButton` | 24px icon action beside a section title or field (add, delete, duplicate, revert), with an optional `hint` tooltip |
| `InlineField` | Figma-style field: a prefix letter (X, Y, W, H, T/R/B/L) or icon shares one `FieldShell` box with its input |
| `PropertyField` | `InlineField` with a letter prefix and a descriptive accessible label |
| `FieldLabel` | Caption above a full-width control |
| `SectionHeading` | Consistent compact inspector heading |
| `PrimaryButton` / `SecondaryButton` | 28px text buttons with optional leading icon; one primary action per surface |
| `Segmented` / `Segment` | Segmented control; `aria-pressed` drives the selected (`:checked`) look |
| `RowButton` | Full-width secondary action with a leading icon |
| `FloatingBar` | Canvas chrome surface: toolbar, zoom, collapsed headers, status toast |
| `Dialog` | Modal surface for Add screen, Project, Export, and Review |
| `Divider` / `Kbd` | Toolbar separator; keyboard hint chip |
| `MenuItem` | Action, optional icon and shortcut hint, disabled/destructive state, closing menu target |
| `MenuDivider` | Separation between groups of related actions |
| `Tool` | Custom button compositions using the standard hit area and interaction states |
| `Field` | Native text inputs and selects; Exact owns their focus behavior |
| `TreeRow` | Layer row hover and keyboard focus treatment |
| `VisibilityButton` | 24px eye toggle at the end of a tree row. It appears while the row is hovered or focused, and stays visible with `eye-off` while the item is hidden |
| `InspectorValue` | Single compound-value field with an inline All/Both identifier |
| `PanelSection` | Padding, vertical rhythm, and divider for inspector groups |
| `Menu` | Popover surface, width, border, radius, and elevation |

```contract
IconButton(icon="hand", label="Pan", hint="Pan (H) · Hold Space to pan",
  shortcut="h", selected=hand, disabled=false, testId="hand-tool", press=handTool)

PropertyField(label="X", accessibleLabel="X position", value=`${node.x}`,
  testId="position-x", change=moveX)
```

Native inputs and selects cannot take state parts, so they keep the platform focus ring. Prefix glyphs never overlay a control: they sit in the same `FieldShell` beside a transparent input, which keeps the verify audit's covered-text check clean.

Use accessible labels for icon-only controls and descriptive names for fields. A tooltip supplements the label.

## Tooltips

Every icon-only control has a tooltip. Write it as `data-tip`, not `title`: the tooltips hatch shows it in the top layer after a short hover, or right away when moving between controls, and on keyboard focus. Native `title` tooltips are slow and unstyled, so the studio uses `title` only on the preview iframe, as its accessible name.

Write tooltip text as `Name (shortcut) · detail · detail`. The name repeats the accessible label in plain words; a trailing shortcut such as `(⌘Z)`, `(H)` or `(⇧1)` becomes a key chip; each detail becomes a muted line that says what the control does or a condition, in a short sentence without a period. Name a toggle by what pressing it does now, such as `Hide screens panel` or `Restore preview effects`. Leave the details out when the name says everything, as for `Zoom in`.

Tooltips use a fixed dark surface in both themes, so they read against the panels and canvas. Pointer down, scrolling, the wheel, Escape and leaving the window hide them. Disable actions that are temporarily unavailable; omit operations the tool does not implement. Do not add decorative eyebrows, placeholder tabs, or buttons that cannot perform an action.

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
| Click a row's eye in the sidebar | Hide or show that screen or viewport. Hidden frames are not drawn, loaded, hit-tested, snapped to, or fitted |
| Select an offscreen app layer | Move the canvas camera just enough to reveal it |

Text entry keeps its own keys. Source apps receive their normal input in Preview mode. Canvas iframe gestures are accepted only from a registered window inside the canvas with the expected origin and `__ed_canvas=1`. Input ownership survives native inspection ending or restarting; full-screen Preview uses `__ed_canvas=0`. Camera updates remain in the Contract and persist through the existing workspace storage.

Each canvas frame uses CSS translation and scale, with a browser compositing hint supplied by the preview hatch. Frames remain mounted during navigation so app state, source identities, and editing sessions survive camera changes. Below 15% zoom, canvas previews drop CSS backdrop filters: at that size a blur spans a few screen pixels, but the GPU still re-renders it on every frame. They return above 18%, and the gap prevents flicker near the boundary. The hatch reads the zoom from the frame scale that Exact writes, so camera state stays in the Contract. A preview that loads or reloads receives the current detail level. Full-screen Preview always shows full detail.

On page load, a veil covers the canvas from the first frame until every visible live preview has rendered (`booting`), so frames appear together instead of loading in one by one. Its indicator (pulsing device outlines, a count and a progress bar) fades in after 300ms, so a fast load shows only the empty canvas. The veil waits for a setup link to finish and leaves the moment every preview has reported. It also leaves on a click, on **Edit app**, after 4 seconds without progress, or after 15 seconds in all. A workspace with no visible live previews drops it as soon as the workspace loads, without the indicator or a fade. It does not return after the first load. Under reduced motion it appears and leaves without animation.

The studio scopes each frame id it sends to the helper to the page (`<page>~view-1`, from the page's start time), and strips the scope from replies. Two studio pages showing the same workspace therefore never share a frame's readiness, size, or editing state. Each reload registers new ids, so when the helper's 200-frame table is full it evicts the frame that a closed page left behind longest ago. Live frames report every 400ms.

**Reduce preview effects** (`reducedEffects`, a persisted Contract state) drops backdrop filters at every zoom and removes CSS animations with `animation: none`, so animated elements show their resting style. The view writes it to `data-preview-effects` on the hatch element, and the hatch relays it to each canvas preview with the zoom detail level. Switching restyles every visible preview at once, which costs a single long frame; turning it off restarts the previews' CSS animations.

## Native preview drawer

The drawer floats over the right edge of the canvas, like the other floating chrome, and leaves the canvas frames mounted and editable. The bottom toolbar's phone button, **Preview on iOS** under a project screen's route, and the canvas context menu toggle it; `nativeOpen`, the device and the appearance persist in the Contract. It follows the active screen. The drawer sizes the simulator's screen from the viewport height so the screenshot keeps its aspect ratio, and hides while a sidebar overlays the canvas. **Refresh** is the drawer's primary action. During a job, a step card floats over the screenshot area: each step shows a check, a spinner or a pending dot, the active step shows a timer and a progress bar that fills only while capturing, where the helper sends a real fraction, and slides otherwise, and reduced motion stops the spinner and sliding bar. The job's message, completion and errors appear in a line under the actions, not in a canvas toast. While the app editor holds unapplied drafts, a notice above the actions says the native build does not include them.

The drawer's last section is **Expo Simulators**. Its header pairs Expo's mark (`ExpoMark` in `ui.contract`, a filled glyph on an inverted ink tile, so it reads as a brand rather than a tool icon) with the service name, the connected account, and a settings pencil. Before setup, a one-line explanation sits beside **Set up**. Once connected, **Test remotely** is a secondary button, so the local **Refresh** stays the drawer's one primary action. While a test runs, the section lists its steps inline, styled like the native step card. With a session running, **Show this screen** and **Open simulator** share a row, and a status line with a green dot names the device and offers **Stop**. A muted dot and "Your code changed" replace it when the upload is stale, and the button becomes **Update & show**. Links that leave the studio carry the `external-link` icon. The setup dialog is a route, like Project and Add screen: three numbered steps, a password field for the token, and a notice about plan usage above its actions.

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

## Review before Apply

Pending drafts appear in a highlighted card at the top of the inspector with a count, undo, discard, **Review**, and **Apply**. **Review** opens a dialog that groups `draftFiles` by source file in line order. Each change shows its property icon, readable name, element label, line, and a `property=value` diff, with swatches for literal colours and badges for new properties, replaced expressions, and shared styles. A per-change revert sends the `revert` design operation: it removes one patch, keeps the rest of the draft, adds one undo step, and records a timeline entry. Applying or discarding from the dialog uses the same checked operations as the card, and the dialog closes when the draft is empty.

`studio/draft-review.ts` builds the review model from the serialized draft, so older saved drafts render without migration. Patches store the selected element's label when staged.

## Design timeline

The clock button in the floating toolbar opens a horizontal sequence of edits. Each point uses an icon for its operation or edited property. Selecting it shows the action, element, author, time, source address, and before/after values. `studio/history-icons.ts` derives icons from event metadata, so older saved entries gain the same treatment. Opening history does not rewind the live design. Closing it restores the full canvas area.

`studio/design-history.ts` persists an append-only journal in `app:/data/design-history.json`. Entries have an ID, parent ID, timestamp, project, actor (`user` or `ai`), operation kind, target, structured changes, and before/after state. The current manual editor records `user`; the actor field supports a later AI command adapter. There is no AI editing endpoint yet.

Source events include draft edits, undo, discard, and Apply to code. Workspace events include screen-library changes, geometry, local layer properties, creation, deletion, undo, and redo. Pointer movement is committed as one geometry edit. Selection, hovering, camera movement, and no-op writes create no entries. History is scoped by the connected project origin, like saved drafts, and survives editor and helper restarts in the same browser storage.

Workspace events retain document snapshots. Source events retain draft patches, original values, source addresses, and file hashes. These are comparison evidence, not full source-repository or application-state snapshots. Point comparison, branching, replay, and rollback of applied code are not implemented. Undoing or discarding a draft adds an event rather than removing its earlier history.

## Verification

- `bun run test`: source editing, persistence, selection, geometry, and proxy tests.
- `bun run test:ui`: Exact behavior tests, including camera coordinates and context actions.
- `bun run test:preview`: isolated real-browser tests. The studio regression covers icon tint and centering in both themes, right-click targeting, keyboard focus, edge placement, Space and middle dragging, and typing. The real-app regressions cover menus and navigation across inspected iframe boundaries, literal text editing, independent padding and corners, linked values, checked source writes, timeline persistence, property additions, explicit responsive overrides, and stable controls during background polling.
- `bun run verify`: the required Exact layout and behavior audit.

New controls use these primitives and add behavior tests where they introduce interaction or state. Changes to tokens apply to all consumers; feature-specific source editing belongs outside the component library.
