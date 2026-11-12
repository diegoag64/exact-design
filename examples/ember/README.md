# Ember

Ember is the showcase app for Exact Design: a calorie and activity tracker built with Exact. The same app runs on iOS, macOS, Linux and the web. Phones get a single column and a bottom tab bar. Wide windows get a dashboard with the tabs in a sidebar.

## Run it

From the repository root:

```sh
bun run demo
```

The app serves on `http://127.0.0.1:5174` and allows framing from the editor on port 5173. To use another port, pass Exact's arguments through:

```sh
bun tools/demo.mjs web --port 5184
```

In the editor, click **Connect project**, name it Ember, and enter the app's URL. The Add screen form lists every screen below.

## Screens

Each screen is its own route, so the editor can place each one on the canvas.

| Screen | Route | What it shows |
|---|---|---|
| Today | `/` | Calories left, macros, steps and active energy, water, meals and the week |
| Diary | `/diary` | A seven-day strip, the day's totals, and each meal's foods |
| Add food | `/diary/add` | A sheet: pick a meal, search 26 foods, add one with a tap |
| Activity | `/activity` | Steps and four stats, steps by hour, the week's steps, recent workouts |
| Log workout | `/activity/log` | A sheet: six workout types, a duration stepper, an energy estimate |
| Profile | `/profile` | Goal, streak, weight trend, daily targets, replay onboarding, reset |
| Welcome | `/welcome` | The first screen of onboarding |
| Onboarding goal | `/onboarding` | Name and goal: lose, maintain or gain |
| Onboarding body | `/onboarding/body` | Weight, goal weight, height, age and activity level |
| Onboarding plan | `/onboarding/plan` | The daily calories and macros calculated from the answers |

Welcome and onboarding are full-screen and hide the tab bar. **Start tracking** saves the plan and returns to Today. Profile ▸ **Replay onboarding** opens Welcome again.

## Layout

Breakpoints read `exactViewport()`:

- Below 600 pixels the app uses phone spacing: 16-pixel margins and smaller titles.
- The dashboard has one column below 640 pixels of content width, two from 640, and three from 1040. Content width excludes the 240-pixel sidebar.
- From 900 pixels the web and macOS draw the root tab bar as a sidebar. iOS uses UIKit's tab bar.

Sheets are modal routes: UIKit sheets on iOS, dialogs on the web. Each draws its own title bar (`header appearance="none"` with the `SheetTitle` component): an icon for the meal or workout, the title, a live summary and a round close button. Add food adds a filled search field and a segmented meal picker. Log workout has a full-width Save button at the bottom.

## Glass

The glass panels follow one pattern. An `Aurora` layer of animated radial gradients sits behind a panel with the `Glass` style: a translucent fill, `backdrop-filter="blur(30px) saturate(1.8)"`, a light border and an inner highlight. The panel is the aurora's next sibling because macOS only blurs content from the panel's parent.

On iOS, Exact draws the tab bar, sheets and the floating + button (`buttonStyle="prominent-glass"`) as UIKit controls. On iOS 26 these use the system's Liquid Glass. The app's own panels use iOS's fixed blur material.

Motion respects reduced motion: when `prefersReducedMotion` is set, the aurora stops drifting and rings, bars and cards appear without animating in.

## Data

`app.ts` stores everything in one file, `app:/data/ember.json`: the profile, logged foods, water by day, activity by day, workouts and weigh-ins.

When no file exists yet, the app shows a seeded sample week ending today. Today's dinner is left empty so the dashboard has something to do. The sample is saved after the first change. **Reset demo data** replaces the file with a new sample.

Sources:

| Source | Use |
|---|---|
| `loadBoard(today)` | Everything the dashboard, Activity and Profile show |
| `loadDay(today, day)` | One diary day |
| `searchFoods(query)` | The food library |
| `addFood`, `removeEntry` | Diary writes |
| `setWater` | Glasses for the day |
| `logWorkout` | Adds a session and its steps, energy and minutes |
| `saveProfile` | Stores the onboarding answers and plan |
| `resetDemo` | Restores the sample week |

### The plan

Onboarding calculates targets in `app.contract` and sends them to `saveProfile`:

- Resting energy: `10 × kg + 6.25 × cm − 5 × age − 78`, a sex-neutral Mifflin–St Jeor estimate.
- Activity factor: light 1.375, moderate 1.55, very active 1.725.
- Goal: −450 kcal to lose, +300 kcal to gain. The result is rounded to 10 kcal, with a minimum of 1,200.
- Protein: 2 g per kg, or 1.6 g per kg to maintain. Fat: 28% of calories. Carbs: the rest.

These are demo numbers, not dietary advice.

## Design tokens

`app.tamber` defines every colour as a light and dark pair:

- `page`, `card` and `card-2` for surfaces; `ink`, `ink-2` and `ink-3` for text; `line` for dividers.
- `glass`, `glass-strong`, `glass-edge` and `glass-shade` for glass.
- `ember` for the accent, `ember-ink` for accent text, and `cta` and `cta-2` for the main button's gradient.
- `rose`, `amber`, `iris`, `fern` and `sky` for protein, carbs, fat, movement and water. Each has a `-soft` tint for icon tiles.
- `aura-1` to `aura-6` for the aurora colours.

Shared styles in `app.contract` (`Card`, `Glass`, `GlassChip`, `Tile`, `Round`, `Pill`, `Chip`, `Num`, `Caption`, `Eyebrow`) appear in the editor's inspector as shared values. Font sizes are in `rem`, so text follows the reader's size setting.

Icons are tokens: an SF Symbol on Apple platforms and a filled [Phosphor](https://phosphoricons.com) SVG from `assets/icons` elsewhere. Phosphor's MIT licence is in `assets/icons/LICENSE`.

## Tests

`app.test.contract` covers the dashboard totals, logging food, water, switching diary days and removing a food, logging a workout, the whole onboarding flow, and resetting the sample. Each test pins the date and time zone.

```sh
cd examples/ember
bun ../../tools/demo.mjs test web
bun ../../tools/demo.mjs verify --shots .exact/shots
```

`verify` finds nothing at normal text sizes in light and dark, at phone and desktop widths. At the largest accessibility text size, layouts still overflow and need a dedicated pass.

## Files

- `app.contract`: routes, state, actions and every screen and component.
- `app.ts`: the data module, food library and sample week.
- `app.tamber`: colours and icon tokens.
- `app.test.contract`: tests.
- `app.json`: app identity and hosts.
- `assets/icons`: SVG icons for non-Apple platforms.
