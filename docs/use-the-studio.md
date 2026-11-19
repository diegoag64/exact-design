# Use the studio

Start the editor with the [README setup commands](../README.md#run-locally).

## Connect your app

1. In your Exact app directory, start its development server with the editor port allowed:

```sh
EXACT_TOOL_PORT=5173 bun exact.mjs web --port 5174
```

2. In the editor, click the project name above Screens and choose **Project settings…**.
3. Enter a project name and `http://127.0.0.1:5174`, then click **Connect**.
4. Click **+** beside Screens, choose a discovered route, and select its viewports.

Use **Add all** to add routes that are not already on the canvas. For a dynamic route, replace parameters with a real path, such as `/note/7`. Use **Refresh screens** after adding routes to your app.

For a connection that also adds the screens, open a setup link:

```text
http://127.0.0.1:5173/?connect=http://127.0.0.1:5174&name=Ember&viewports=Core
```

Replace the app URL and name with your own. Set `viewports` to a device preset or a set: `Core`, `Apple%20devices`, or `Every%20size`. To load fewer previews at first, add `show` with a comma-separated list of screen names or routes, such as `&show=Today,/welcome`. The link still adds every screen, but only the listed ones start visible; show the others from the Screens panel. A link opens its app's own workspace and adds the screens once per browser. Opening it again opens that workspace as you left it. If setup fails, start the app and click **Retry**.

If a preview is blank, use `127.0.0.1` for the editor URL and restart the app with `EXACT_TOOL_PORT` matching the editor port. Keep the app server running.

## Work on several projects

Each app you connect is a project with its own workspace: its screens, layout, camera, drafts and timeline. Projects never share a canvas.

- Click the project name above Screens to open the project menu. Choose a project to switch to it. The project you leave keeps its camera and everything else.
- **Connect another app…** opens a new app in its own workspace. A setup link for another app does the same.
- **Project settings…** renames the shown project or changes its address. Entering the address of an app that already has a project opens that project instead.
- Each tab's address names its project (`/?project=…`). Open two tabs to work on two apps side by side; reloading a tab keeps its project. A tab opened without one shows the project you opened last.

The studio identifies an app by its folder, which Exact's local editing server reports, not by its address. An app that restarts on another port keeps its project. If a different app answers at a project's address, the studio says so: the project's screens pause, editing is refused, and **Open** opens the running app in its own workspace. Click the refresh button in the notice to check again. A setup link or **Project settings** that points at an address where another app's project ran asks before opening the new app in a **New workspace**; × cancels and leaves everything as it was.

Two cases need your choice before the studio ties an app to saved work:

- **Saved before identities.** Projects migrated from an earlier version don't know their app yet. When an app answers at their address, the notice asks: **Confirm** ties it to the project, and **Open separately** opens the app in a new workspace. A setup link to that address asks the same with **Use saved** and **New workspace**. Drafts saved before migration stay with the address until you confirm.
- **An app that can't be identified.** A server without Exact's editing API, or one that isn't running, can't say which app it is. A setup link to an address with saved work asks whether to **Use saved** or start a **New workspace**, and changing a connected project to such an address asks the same. Editing stays paused until the project's own app answers there.

While another app answers at a project's address, its route list is not offered: **Add all** and **Remove** wait until the project's own app is back.

When the app no longer lists a screen's route, the Screens panel marks that screen and the canvas shows why instead of the app's not-found page. Click **Remove** in the panel to delete those screens in one undo step, or add the route back to your app.

## Arrange screens

- Click a sidebar screen or viewport to pan to it without changing zoom.
- Drag a frame title to move it. Hold Option or Alt to bypass snapping.
- Drag the lower-right handle to resize a frame, or enter dimensions in the inspector.
- Click **+** beside Viewport to add a linked size or device set.
- Click **Tidy up** beside Screens to arrange one row per screen. For a workspace that fits one view, such as a demo screenshot, add `layout=collage` to the studio's address (`http://127.0.0.1:5173/?layout=collage`). Tidy up then packs the screens into columns and keeps each screen's viewports side by side. The option applies while it is in the address.
- Click the zoom percentage to fit all screens.
- Hover a screen or viewport in the sidebar and click its eye to hide it. A hidden screen hides all of its viewports. Hidden rows stay dimmed with a crossed-out eye; click it to show them again. Showing a viewport inside a hidden screen shows only that viewport.

Linked viewports share screen content. To create independent content, duplicate the screen instead.

For local previews, use **Auto** beside Height to expand frames to their rendered content. Enter a height to test a fixed device viewport. Modal routes keep the device height. Auto height does not load unrendered items in infinite feeds or virtualized lists.

Use **Preview** to interact with the app. Local previews share supported app data and root state, while navigation and scroll remain separate for each frame.

## Preview on the iOS Simulator

Web frames approximate an iPhone or iPad. On iOS, an Exact app's tab bar, sheets and glass buttons are UIKit controls. The **Native preview** drawer shows the selected screen as the app's native build renders it in the iOS Simulator. The canvas keeps the editable web frames, so you can edit the app with the drawer open and refresh it to check the native result.

You need a Mac with Xcode and an iOS Simulator runtime. The first build takes several minutes and about 20 GB of free disk space; later refreshes reuse it.

1. Give your app a deep link for each route. Add a protocol handler to `app.json`, such as `"protocol_handlers": [{"protocol": "web+myapp", "url": "/open?u=%s"}]`, and an `/open` route that opens `web+myapp://<route>` at that route. [Ember's README](../examples/ember/README.md#deep-links) shows both.
2. Tell the helper where the app's folder is: start the studio with `EXACT_DESIGN_NATIVE_APPS=/path/to/app bun run dev`. Separate several folders with `:`. Ember is registered already.
3. Select a screen from the project and open the drawer: click the phone button in the bottom toolbar, **Preview on iOS** under the screen's route in the inspector, or **Show native preview** in the canvas context menu.
4. Choose a device and **Light** or **Dark**, then click **Capture**.

The helper builds the app, starts its own simulators (named `Exact Design …`), opens the route through its deep link, and captures it. While it works, the drawer lists three steps (**Build app**, **Prepare simulator** and **Capture**) with a timer on the current one. While it builds, the step names the Rust crate being compiled and counts them, then Swift and packaging, with a sliding bar: the build doesn't report how much is left. The bar fills as screens are captured. A rebuild shows how long the last one took.

The first build in a checkout compiles everything and takes several minutes. Each checkout and worktree keeps its own build and screenshots, so a new checkout builds again. After that, a refresh with no source changes skips the build, and a change to the app rebuilds incrementally, usually in seconds. The drawer follows the selected screen and keeps one screenshot per screen, device and appearance. **Refresh** captures the selected screen again even when it is current. **Refresh all** captures every connected screen whose screenshot is missing, stale or failed; when every screen is current, the drawer says the previews are up to date. A screenshot marked **Stale** is from before the app's source last changed. Refresh skips the build when nothing changed. If a refresh fails, an existing screenshot stays visible with a failure notice, and the drawer shows the error details.

The native build reads the app's source files. Unapplied draft edits appear in the web frames but not in the drawer, and the drawer says so while you have them. **Apply** them, then **Refresh**.

Workspaces saved with the earlier read-only native canvas frames open them as editable web frames of the same size.

The first refresh boots the simulators and can take a few minutes. Later refreshes keep the app running and reuse its build. Each device in the drawer runs its own simulator. Several simulators can cause swapping on a 16 GB Mac. The simulators run with Reduce Motion on, so animated screens hold still for the screenshot; they look the same otherwise.

The first native build adds `ios` to the app's `app.json` hosts, as `bun exact.mjs ios` does. The simulators stay running while the studio is open and shut down when you stop `bun run dev`.

## Test remotely on Expo Simulators

[Expo Simulators](https://docs.expo.dev/eas/simulators/) runs your app on a cloud iPhone that you use in a browser tab. The studio builds your latest saved code, uploads it, and opens the selected screen. Use it to try the app by hand, share a screen, or test on a device you don't have locally. You need an Expo account whose plan includes Simulators, and the same Mac and Xcode setup as native previews (steps 1 and 2 of [Preview on the iOS Simulator](#preview-on-the-ios-simulator)). The app is still built on your Mac.

**Connect once per project.**

1. Open the **Native preview** drawer and click **Set up** under **Expo Simulators**.
2. Click **Open Access tokens**, sign in to expo.dev, create a token, and copy it.
3. Paste it into **Access token** and click **Connect**.

The studio checks the token with Expo and creates an Expo project for the app (`exact-design-<app name>`), or links the existing one. The token is saved on this computer for this project only, in the helper's cache (`.exact/native-previews/<app>/expo/token`, readable only by you). It is not saved in the workspace or the repository. To use another account, or to forget the token, click the pencil in the drawer's Expo section.

**Test a screen.**

1. Select a screen and click **Test remotely**. The drawer shows four steps: **Build your latest code**, **Start a cloud iPhone**, **Upload the app**, and **Open this screen**. The first test takes about a minute after any build: starting the simulator takes about 30 seconds and uploading about 30.
2. Click **Open in Simulator**. A new tab shows the same steps, then becomes the cloud iPhone, at the selected screen. Sign in to expo.dev if it asks.
3. To check another screen, select it and click **Open in Simulator** again. It reuses the running iPhone, so it takes a few seconds. If your saved code changed, it rebuilds and uploads the app first; the drawer says "Your code changed" until then. Each click opens a new tab, and every tab shows the same iPhone, so you can close the older ones.

The cloud iPhone uses the drawer's device. Choosing another device and testing again replaces the session. Unapplied drafts aren't in the build; **Apply** them first. The drawer's **Light** and **Dark** apply only to local captures.

A running cloud iPhone uses your plan's simulator time. It stops when you click **Stop**, after 15 idle minutes, after an hour in all, or when you stop `bun run dev`. The studio checks the session with Expo every 20 seconds, so one you end on expo.dev, or one that times out, leaves the drawer within about 20 seconds.

## Review and apply edits

1. Select a connected viewport and click **Edit app**.
2. Select an element on the canvas or in the Layers tree. Press Escape, or click **×** beside its name in the inspector, to clear the selection. With nothing selected, Escape finishes editing.
3. Change its properties in the inspector. Press Enter or leave the field to preview a value.
4. Click **Review** to inspect changes grouped by source file.
5. Revert individual changes if needed, then click **Apply changes**.

Property edits create a local draft. They do not write source until Apply. Drafts survive reloads and remain after **Done editing**. Use draft undo to undo an edit, or discard to restore the source values.

### Adjust values precisely

- **Number fields:** press ↑ or ↓ to step a value by 1, with Shift for 10 or Option (Alt) for 0.1. The unit is kept, and the change previews when you stop pressing. Drag a field's letter or icon, such as **W** or the radius icon, sideways to scrub the value. Type simple math such as `16*2` or `(24 - 8) / 2` and press Enter.
- **Spacing on the canvas:** click a padding, margin or gap label to type a value, or drag the label to adjust it and release to preview. In the label's editor, ↑ and ↓ step the value and Enter applies it.
- **Measure distances:** with an element selected, hold Option (Alt) and point at another element. Red lines show the distance to it, or to each edge of a parent. Release Option to see the spacing overlay again.
- **Colours:** a colour field's swatch shows the colour of its theme token, such as `ember`. Click the swatch to choose from the app's theme colours first, or enter a custom value. A raw colour that is not one of the theme's tokens shows a warning icon, because it will not follow light and dark mode.
- **Alignment:** in a flex container, the 3×3 grid sets alignment on both axes in one change, so one undo reverts both. It follows the direction the container renders. **Distribute** still offers the space-between options.
- **Sizing:** beside Width and Height, choose **Hug** (fit the content, `auto`), **Fill** (`100%` of the parent), or **Fixed** (starts from the element's current rendered size).

Use the chain control to link spacing or corner values. Unlink them to edit each value separately. Shared-style edits affect other elements that use that style. For a responsive expression, choose **Override** only when you want a static replacement.

Apply checks source hashes and validates the complete batch with the Exact compiler before writing. If source has changed externally, discard the stale draft before editing again. Use source control to revert an applied batch. Draft undo cannot reverse it.

Editing requires a local Exact development server with the `forma/1` editing API. Remote previews, package sources, data-bound text, and ambiguous source locations remain read-only.

## Choose light or dark

Click the sun-and-moon button beside the zoom controls. **Studio** sets the panels and canvas, and **Screens** sets your app in the canvas previews and the paper of plan view. Each one can match your system or stay light or dark, so you can check your app's dark theme without changing your Mac. Full-screen Preview always follows your system, and the **Native preview** drawer has its own Light and Dark. Both choices are remembered.

## Check layout in plan view

Click the compass button in the bottom toolbar, or press ⇧P, to show every screen as a line plan. Surfaces become outlines, text becomes bars that follow each line, and icons keep only their outlines. Plan view hides colour, imagery and effects, so alignment and spacing are easier to see. Selection, spacing labels and editing work as usual. Click the button again to see the real styling. Full-screen Preview always shows the app as it is.

The arrow beside the compass button opens two options, and both are remembered:

- **Layout boxes** (⇧B) outlines the containers your app never paints, such as rows and columns, with faint dashed lines. Use it to see how the layout is nested and where each group starts and ends.
- **Readable text** (⇧T) replaces the bars with the app's own words, in their font and on the same lines. Use it to check copy, truncation and baseline alignment.

Password fields use bullets in readable text and measure their bars from those bullets. Non-text inputs, such as checkboxes and sliders, contribute no text.

The shortcuts work while plan view is on.

To measure part of a screen, hold Shift and drag a rectangle over it. The region shows every padding, gap and margin inside it, the size of each surface and image, and the corner radii. Radius labels and copied specs show one value when all corners match, or four values in top-left, top-right, bottom-right, bottom-left order, such as `radius 12 12 0 0`. Each radius is clamped to half the smaller side. Rows with the same structure and layout measurements are labeled once and marked, for example, ×3. Grouping compares each row's own width and four margins, and the height, padding, gaps, four corner radii and layout direction of the row and everything inside it, rounded to whole pixels. Positions can differ, and so can a child's width and used auto margins that follow its text or value. Click **Copy** above the region to copy its spec as an indented outline, such as `Column "Energy" · 342 × 455 · padding 22 · gap 20 · radius 28`. Press Alt+A (Option+A) over a screen to measure the whole screen. Press Escape or click outside the region to clear it. Regions also work without plan view, over the app's real styling.

Labels keep the same size at every zoom. When labels would overlap, some wait until you zoom in.

## Inspect the timeline

Click the clock button in the bottom toolbar to inspect saved design changes. Select an entry to see its target and before-and-after values. Timeline selection does not restore an earlier design or undo applied code.

## Create a blank screen

Choose **Blank** when adding a screen. Add text, rectangles, or buttons from the bottom toolbar. Select a layer to move, resize, or edit it.

Use **Fill** width to preserve left and right insets across viewport sizes. Increase a text layer's height when wrapped text needs more room. Blank screens use flat layers with explicit vertical positions, without nested layout or automatic vertical flow.

Click **Export** to copy Contract source for the active viewport. Add button actions in your application. Connected app screens do not support this export.

## Save and navigate

Each project's workspace saves automatically, in this browser's storage for the studio's address and port. Reopen that address to restore it. Use **Save** to retry a failed write. Workspace saves and app design drafts are separate.

Saved data from earlier versions, one workspace for the whole studio, moves into projects the first time the studio opens. Its screens, layout, selection, drafts and timeline are kept, and the original files are left unchanged. Drafts and timeline entries saved for other app addresses become projects of their own, named after the address.

Use these shortcuts when a text field is not focused:

- **V** selects the Select tool.
- **H** selects the Pan tool.
- **Shift+P** shows or hides plan view. While it is on, **Shift+B** shows or hides layout boxes and **Shift+T** switches between bars and readable text.
- **Shift** with drag measures a region of a screen, and **Alt+A** (Option+A) measures the whole screen.
- **Space** with drag temporarily pans, including during app editing.
- **Command or Control+S** saves.
- **Command or Control+Z** undoes.
- **Command or Control+Shift+Z** redoes.

Scroll to pan and pinch to zoom. Use the panel buttons to hide or restore the sidebar and inspector. Below 15% zoom, canvas previews omit backdrop blur to keep navigation smooth. Zoom in, or use full-screen Preview, to see it. On a slower machine or on battery, turn on **Reduce preview effects** (the lightning button beside the zoom controls). Canvas previews then omit backdrop blur at every zoom and skip CSS animations, showing each element at rest. Full-screen Preview always shows the real effects, and the setting is remembered.
