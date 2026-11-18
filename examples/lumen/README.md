# Lumen

Lumen is a personal finance app built with Exact: net worth, accounts, payments, cards, budgets and savings goals. The same app runs on iOS, macOS and the web. Phones get a single column and a bottom tab bar. Wide windows get a dashboard with the tabs in a sidebar.

> **Experimental.** Lumen is a superficial demo, mainly for benchmarking performance changes in Exact and the studio. Its data is sample data, and it isn't a supported or production-ready app. For the reference example, see [Ember](../ember/README.md).

## Run it

From the repository root:

```sh
bun run demo:lumen
```

The app serves on `http://127.0.0.1:5177` and allows framing from the editor on port 5173. To use another port, pass Exact's arguments through:

```sh
bun tools/demo.mjs --app lumen web --port 5186
```

With the editor running (`bun run dev`), open this link to connect Lumen and add its screens at phone, tablet and desktop sizes. The five tabs and Send money start visible; show the rest from the Screens panel:

```
http://127.0.0.1:5173/?connect=http://127.0.0.1:5177&name=Lumen&viewports=Core&show=Home,Activity,Cards,Budgets,Goals,Send
```

`bun run demo:lumen` prints the link. Remove `show` to start with every screen visible.

## Screens

Each screen is its own route, so the editor can place each one on the canvas.

| Screen | Route | What it shows |
|---|---|---|
| Home | `/` | Net worth with its 30-day line, quick actions, accounts, the month's spending and recent payments |
| Send | `/send` | A sheet: pick a contact, type an amount on the keypad, add a note, send from Everyday |
| Profile | `/profile` | A sheet: the account holder, payment alerts and Face ID switches, replay welcome, reset |
| Welcome | `/welcome` | The full-screen introduction |
| Activity | `/activity` | Money in and out this month, search, a kind filter, and payments grouped by day |
| Transaction | `/activity/transaction` | A sheet: one payment's receipt and details |
| Cards | `/cards` | The selected card, its monthly spending against its limit, and a freeze switch |
| Budgets | `/budgets` | A category ring with what is left, the month's pace, each category's budget, and the last seven days |
| Goals | `/goals` | Total saved and a card per goal with its progress ring and suggested monthly amount |
| Deposit | `/goals/add` | A sheet: pick a goal, choose an amount, and see the progress it adds |

Welcome is full-screen and hides the tab bar. **Get started** returns to Home. Profile ▸ **Replay welcome** opens it again.

## Deep links

Every screen opens from a `web+lumen:` link. `app.json` declares the scheme, and the `/open` route forwards `web+lumen://<route>` to that route: `web+lumen://goals/add` opens Deposit, and `web+lumen://` opens Home. The studio's native previews use these links to open each route in the iOS Simulator.

## Glass

Hero panels follow Ember's pattern: an `Aurora` layer of drifting radial gradients sits behind a panel with the `Glass` style, and the panel is the aurora's next sibling so macOS samples the backdrop. `Glass` sets `backgroundMaterial="glass"`, which is `UIGlassEffect` on iOS 26 and `NSGlassEffectView` on macOS 26. The web draws its translucent fill and `backdrop-filter` blur. The tab bar and sheets are UIKit's, with the system's Liquid Glass.

A frozen card swaps its face for a glass pane with the frozen state, so the card's number is never drawn under the frost.

## Data

`app.ts` stores balances, card states, goal progress and the payments the person made in one file, `app:/data/lumen.json`. Card spending, salary and bills are generated from the day the data was first seeded, so the sample quarter stays put as days pass. Money is kept in cents and formatted with `formatNumber(…, "currency", "USD")`.

| Source | Use |
|---|---|
| `loadBoard(today)` | Everything Home, Cards, Budgets, Goals and Profile show |
| `loadActivity(today, query, filter)` | Payments grouped by day, searched and filtered |
| `loadTx(today, id)` | One payment, or the newest when the id is unknown |
| `sendMoney` | Pays a contact from Everyday, up to $5,000 and the balance |
| `moveToGoal` | Moves money from Everyday into Savings for a goal |
| `setFrozen` | Freezes or unfreezes a card |
| `resetDemo` | Restores the sample |

## Design tokens

`app.forma` defines every colour as a light and dark pair: `page`, `card`, `card-2` and `line` for surfaces; `ink`, `ink-2` and `ink-3` for text; `glass`, `glass-strong`, `glass-edge` and `glass-shade` for glass; `accent` and `cta` for the brand; `mint`, `flame`, `amber`, `sky`, `rose`, `grape` and `tide` with `-soft` tints for categories; and `aura-1` to `aura-6` for the aurora. Card faces use fixed gradients.

Icons are tokens: an SF Symbol on Apple platforms and a [Phosphor](https://phosphoricons.com) SVG from `assets/icons` elsewhere, filled for objects and bold for glyphs such as close, plus and arrows. Phosphor's MIT licence is in `assets/icons/LICENSE`.

## Tests

`app.test.contract` covers the sample accounts and hidden balances, sending money and its keypad, an oversized transfer, adding to a goal, freezing a card, the activity filters and receipt, reset, and cold and warm deep links.

```sh
bun tools/demo.mjs --app lumen test web
bun tools/demo.mjs --app lumen verify --shots .exact/shots
```

The latest web audit found no layout problems in light and dark, at phone and desktop widths, at normal text sizes or at the largest accessibility text size. Rows wrap their values onto a second line as text grows, and money amounts, glyphs in fixed tiles, and text drawn on the payment card grow up to a cap. One relaunch storage finding after reset remains, and accessibility-tree coverage was incomplete for the cold deep-link test.
