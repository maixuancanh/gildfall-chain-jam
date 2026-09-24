# Gildfall

Gildfall is a treasure-haul casino game built for the Chain casino SDK. Choose a route, depth and wager before each haul. An angler descends on a rope platform and casts toward a row of chests. Some hauls lose the treasure to a cable strike; a Boom shield can save it. Collecting all five relics pays the top award for the selected depth.

Play the standalone demo: [gildfall-chain-jam.pages.dev](https://gildfall-chain-jam.pages.dev/). It uses practice USDC, with no wallet or real money. Press **ENTER** after loading, choose a route and depth, set the wager, then press **CAST**. You can also aim at a chest in the scene. Holding the cast control moves through the deeper tiers; releasing it commits the haul. Route, depth and wager are fixed before the outcome is drawn. Aiming and animation change the presentation, not the odds.

## Run locally

Use Node.js 24.12.4 or newer.

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4188/>. The standalone page starts with 1,000 practice USDC and caps each practice wager at 100 USDC. The balance resets on a page reload. Reloading during a practice haul discards that unfinished round. Browsers may block music until you press **ENTER**; the sound control mutes music and effects together.

The repository includes the SDK guest bridge files and contract interface needed to build and test the game. It does not include the full SDK simulator. To run a host-backed session, get the current casino SDK and local simulator from [sdk.chain.wtf/casino](https://sdk.chain.wtf/casino), copy `contracts/JinxwellGame.sol` into the simulator's `contracts` directory, and run its local node and harness according to the SDK instructions. Keep this game's Vite server running on port 4188. In the harness, load `http://127.0.0.1:4188/` as the game URL and select `JinxwellGame` as the contract. Simulator balances are local chUSD test tokens, separate from the standalone practice balance.

## How a haul settles

The Solidity contract keeps the technical identifier `JinxwellGame` and implements `ICasinoGameV2`; the same identifier appears in `public/game.manifest.json`. Gildfall is the player-facing title. In an SDK host iframe, the guest bridge opens a session, receives the host's randomness and settlement state, and shows the result. The guest checks that the payout agrees with the game's paytable before displaying a completed host round. A pending host session can reconnect after a reload. The standalone demo uses browser cryptographic randomness and the same payout math, but it does not place an on-chain wager.

There are three routes with increasing volatility and three depths. Each route/depth combination has a 10,000-ticket paytable and 96% theoretical gross RTP before integer rounding. Gross payout includes the stake: 0.5× loses half, 1× breaks even, and the top award is 6×, 9× or 12× by depth. A deeper tier raises the top award while shifting probability from the 4× result to a zero payout. The contract commits to the route, depth and wager before requesting one random word; no timing input changes the settled result. [docs/MATH.md](docs/MATH.md) contains the nine complete paytables, outcome encoding, rejection sampling, reserve calculations and ABI details.

## Checks

```sh
npm test
npm run check:contract
npm run build
```

`npm test` covers the paytable, JavaScript/Solidity payout parity, contract lifecycle and UI logic. It checks all 90,000 route/depth/ticket combinations. `npm run check:contract` compiles the contract with the bundled SDK interface. `npm run build` writes the static site to `dist/`. For a browser smoke test, run `node tests/browser-smoke.cjs` while the local Vite server is available on port 4188. Contract and local simulator tests are not a security audit or evidence of a public-chain deployment.

## Hosting and submission

The current standalone build is hosted on Cloudflare Pages at the URL above. `public/game.manifest.json` is served from the same origin, and `index.html` loads the Chain Jam widget. Hosting this demo does not submit it to the jam or integrate it into the production Chain host. A public host-backed round and contest submission still need to be checked separately.

## Assets and rights

The art under `public/assets/` was assembled for this edition, with selected platform, UI and sound material brought forward from an earlier game. The background track is the supplied `public/assets/audio/bgm.mp3`; the game loops only this track. Ownership and commercial-use rights for that track and the reused slash effect have not been verified. Check those rights before commercial distribution or contest submission. No license for the repository's assets is implied by their presence here.
