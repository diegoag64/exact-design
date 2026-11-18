# Tide

Tide is a personal finance app experiment with balance, activity, spending, and savings screens. Its sample data is static.

## Run it

From the repository root, run `bun run tide` to start the app on port 5194. Start the Studio with `bun run dev`, then open:

```text
http://127.0.0.1:5173/?connect=http://127.0.0.1:5194&name=Tide&viewports=Core&layout=collage
```

Click **Tidy up**, then click the zoom percentage to fit every screen. Use **Appearance** to switch the Studio and screens between light and dark.

## Check it

Run these commands from the repository root:

```sh
bun run test
bun run tide test web
bun run tide verify
```

The web test covers balances, the income filter, and navigation to spending and savings. Native builds are not covered by this test.
