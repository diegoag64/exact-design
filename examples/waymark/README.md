# Waymark

Waymark is the second showcase app for Exact Design: the companion app for an adventure game, *The Chronicles of Aldermere: Song of the Hollow Moon*. The game, its world and its art are invented for this demo. Where [Ember](../ember/README.md) shows a platform-styled product, Waymark shows a fully art-directed one: painted backdrops, carved-wood headers, framed tiles and a display typeface.

## Run it

From the repository root:

```sh
bun run demo:waymark
```

The app serves on `http://127.0.0.1:5176` and allows framing from the editor on port 5173. To use another port, pass Exact's arguments through:

```sh
bun tools/demo.mjs --app waymark web --port 5186
```

With the editor running (`bun run dev`), open the setup link the command prints. It connects Waymark and adds every screen at phone, tablet and desktop sizes, with Home, Map and My Play Data visible first:

```
http://127.0.0.1:5173/?connect=http://127.0.0.1:5176&name=Waymark&viewports=Core&show=Home,Map,My%20Play%20Data
```

Ember keeps port 5174, so both demos can run beside the studio at once.

## Screens

Each screen is its own route, so the editor can place each one on the canvas.

| Screen | Route | What it shows |
|---|---|---|
| Home | `/` | The game's title over a grid of feature tiles |
| Map | `/map` | The realm map with place labels, a filter and progress by region |
| Quests | `/quests` | Whisper Quests to mark done, with a running point total |
| Rewards | `/rewards` | Songs to redeem with quest points |
| Trophy Hall | `/trophy-hall` | A feature that is not open yet |
| Record | `/record` | Today's captures on a timeline |
| Record Data | `/record/data` | Today's numbers |
| My Play Data | `/me` | The hero's portrait, name and badges |
| Edit Name | `/me/name` | A sheet that renames the hero |
| Global Play Data | `/global` | Tallies in cards that open a breakdown |
| Feature | `/feature?id=sketch` | The same unavailable state for the remaining tiles |

## Things to try

- On Quests, tap pictures to mark them done. The point total and the redemption bar fill. **Sort** orders them by points.
- On Rewards, tap a song. It is refused with the points still needed, or redeemed once the total reaches 300.
- On the map, scroll in both directions, cycle the filter between everything, places and vaults, and open **Completion Progress**.
- On My Play Data, tap the pencil to rename the hero.
- On Home, the **…** button resets the demo data.

Quests done, rewards redeemed and the hero's name are kept in `app:/data/waymark.json`.

## Files

| File | Responsibility |
|---|---|
| `app.contract` | Routes, shared styles and every screen |
| `app.ts` | The sample journey and the saved progress |
| `app.forma` | Theme colours. The app has one fixed, dark appearance |
| `app.test.contract` | Behavior tests: `bun tools/demo.mjs --app waymark test web` |
| `assets/art/` | Pictures |
| `assets/fonts/` | Almendra Bold, under the [SIL Open Font License](assets/fonts/OFL.txt) |
| `tools/art/` | The script that draws the interface furniture |

## Art

The pictures come from two sources.

- **Interface furniture** is drawn by code: wood panels, torn edges, frames, badges, ornaments and the title emblem. `bun examples/waymark/tools/art/build.mjs` redraws these files from seeded SVG and bakes them to PNG and JPEG with the SDK's headless Chromium. Pass a name prefix, such as `badge`, to redraw part of the set.
- **Illustrations** are generated images: the forest backdrop, the hero's portrait, the day's captures, the quest pictures, the statistic banners, the home tile icons and the map. They are committed as they are. The build script only derives the dimmed backdrop from the forest picture.

Place labels on the map are app elements, not part of the picture, so each one can be selected and edited in the studio. Their positions in `app.ts` are tenths of a percent across the picture and fourteenths of a percent down it.
