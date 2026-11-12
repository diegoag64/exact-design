# Use the studio

Start the editor with the [README setup commands](../README.md#run-locally).

## Connect your app

1. In your Exact app directory, start its development server with the editor port allowed:

```sh
EXACT_TOOL_PORT=5173 bun exact.mjs web --port 5174
```

2. In the editor, click **Connect project** above Screens.
3. Enter a project name and `http://127.0.0.1:5174`.
4. Click **+** beside Screens, choose a discovered route, and select its viewports.

Use **Add all** to add routes that are not already on the canvas. For a dynamic route, replace parameters with a real path, such as `/note/7`. Use **Refresh screens** after adding routes to your app.

For a connection that also adds the screens, open a setup link:

```text
http://127.0.0.1:5173/?connect=http://127.0.0.1:5174&name=Ember&viewports=Core
```

Replace the app URL and name with your own. Set `viewports` to a device preset or a set: `Core`, `Apple%20devices`, or `Every%20size`. Each browser applies a link once. If setup fails, start the app and click **Retry**.

If a preview is blank, use `127.0.0.1` for the editor URL and restart the app with `EXACT_TOOL_PORT` matching the editor port. Keep the app server running.

## Arrange screens

- Click a sidebar screen or viewport to pan to it without changing zoom.
- Drag a frame title to move it. Hold Option or Alt to bypass snapping.
- Drag the lower-right handle to resize a frame, or enter dimensions in the inspector.
- Click **+** beside Viewport to add a linked size or device set.
- Click **Tidy up** beside Screens to arrange one row per screen.
- Click the zoom percentage to fit all screens.

Linked viewports share screen content. To create independent content, duplicate the screen instead.

For local previews, use **Auto** beside Height to expand frames to their rendered content. Enter a height to test a fixed device viewport. Modal routes keep the device height. Auto height does not load unrendered items in infinite feeds or virtualized lists.

Use **Preview** to interact with the app. Local previews share supported app data and root state, while navigation and scroll remain separate for each frame.

## Review and apply edits

1. Select a connected viewport and click **Edit app**.
2. Select an element on the canvas or in the Layers tree.
3. Change its properties in the inspector. Press Enter or leave the field to preview a value.
4. Click **Review** to inspect changes grouped by source file.
5. Revert individual changes if needed, then click **Apply changes**.

Property edits create a local draft. They do not write source until Apply. Drafts survive reloads and remain after **Done editing**. Use draft undo to undo an edit, or discard to restore the source values.

Use the chain control to link spacing or corner values. Unlink them to edit each value separately. Shared-style edits affect other elements that use that style. For a responsive expression, choose **Override** only when you want a static replacement.

Apply checks source hashes and validates the complete batch with the Exact compiler before writing. If source has changed externally, discard the stale draft before editing again. Use source control to revert an applied batch. Draft undo cannot reverse it.

Editing requires a local Exact development server with the `tamber/1` editing API. Remote previews, package sources, data-bound text, and ambiguous source locations remain read-only.

## Inspect the timeline

Click the clock button in the bottom toolbar to inspect saved design changes. Select an entry to see its target and before-and-after values. Timeline selection does not restore an earlier design or undo applied code.

## Create a blank screen

Choose **Blank** when adding a screen. Add text, rectangles, or buttons from the bottom toolbar. Select a layer to move, resize, or edit it.

Use **Fill** width to preserve left and right insets across viewport sizes. Increase a text layer's height when wrapped text needs more room. Blank screens use flat layers with explicit vertical positions, without nested layout or automatic vertical flow.

Click **Export** to copy Contract source for the active viewport. Add button actions in your application. Connected app screens do not support this export.

## Save and navigate

The workspace saves automatically. Reopen the same browser URL and port to restore it. Use **Save** to retry a failed write. Workspace saves and app design drafts are separate.

Use these shortcuts when a text field is not focused:

- **V** selects the Select tool.
- **H** selects the Pan tool.
- **Space** with drag temporarily pans, including during app editing.
- **Command or Control+S** saves.
- **Command or Control+Z** undoes.
- **Command or Control+Shift+Z** redoes.

Scroll to pan and pinch to zoom. Use the panel buttons to hide or restore the sidebar and inspector. Below 15% zoom, canvas previews omit backdrop blur to keep navigation smooth. Zoom in, or use full-screen Preview, to see it.
