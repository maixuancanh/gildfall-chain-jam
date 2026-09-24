# Gildfall

Gildfall is a treasure-haul casino game made for the Chain casino SDK. Choose a route, depth and wager, then send an angler down into the cavern to collect relics from a row of chests. A cable strike can wipe out a haul; a Boom shield can save it. Collect all five relics for the highest payout at the chosen depth.

[Play the standalone demo](https://gildfall-chain-jam.pages.dev/). It uses practice USDC, not a wallet or real money. Press **ENTER**, choose a route and depth, set your wager, then press **CAST** or aim at a chest. The route, depth and wager are locked before the random draw. Where you aim and how long the animation runs do not change the odds.

## Use it with the Chain casino SDK

Run the standalone game locally with Node.js 24.12.4 or newer:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4188/>. This repository includes the guest bridge and contract interface used by the game, but not the complete Chain simulator. To test a host-backed session, obtain the casino SDK and local simulator from [Chain's SDK page](https://sdk.chain.wtf/casino). Copy `contracts/JinxwellGame.sol` into the simulator's `contracts` directory, run its local node and harness as directed by that SDK, and keep the game server running on port 4188. In the harness, use `http://127.0.0.1:4188/` as the game URL and select the `JinxwellGame` contract. The simulator's chUSD test balance is separate from the standalone practice balance.

## How the SDK fits into Gildfall

`public/game.manifest.json` declares the full-iframe game and its host capabilities. The contract keeps the identifier `JinxwellGame`; the game shown to players is Gildfall. When the page runs inside the Chain host, `src/adapter.js` connects through `@chain/casino-sdk/guest`. It reads the host's wallet, balance and session state, applies the host wager limit, and calls `openSession` with the wager and ABI-encoded route/depth selection from `src/codec.js`.

The Solidity contract implements `ICasinoGameV2`. `onSessionStart` validates the wager and selection, reserves the maximum possible profit and requests one random word. `onRandomness` maps that word to one of 10,000 tickets, calculates the payout and returns the settled game state. The guest decodes that state, checks the host-reported payout against the paytable and reveals the result. It can reconnect to a pending host session after a reload. The standalone demo follows the same payout rules using browser cryptographic randomness, but does not open a host session or place an on-chain wager.

For implementation checks, run `npm test`, `npm run check:contract` and `npm run build`. These cover the paytable, JavaScript/Solidity agreement, contract lifecycle and production build; they do not establish a live-chain deployment.

## How RTP is calculated

Each route/depth pair divides 10,000 equally likely tickets among six payout bands: 0×, 0.5×, 1×, 2×, 4× and a depth-dependent top payout of 6×, 9× or 12×. Multipliers are **gross returns**, including any returned stake. For each band, multiply its ticket count by its payout multiplier, add the results and divide by 10,000.

For example, Sheltered Bend at depth 1 has 1,775 tickets at 0×, 4,000 at 0.5×, 2,500 at 1×, 1,000 at 2×, 625 at 4× and 100 at 6×:

```text
RTP = (1,775×0 + 4,000×0.5 + 2,500×1 + 1,000×2 + 625×4 + 100×6) / 10,000
    = 9,600 / 10,000
    = 96%
```

All nine route/depth paytables use the same weighted gross RTP of 96% before integer rounding. Routes change the volatility; deeper tiers increase the top payout and move some probability from 4× to 0×. The actual payout is `floor(wager × multiplierBps / 10,000)` in base units, so a 0.5× payout can round down for an odd-unit wager. The [math and contract notes](docs/MATH.md) list every ticket weight, the outcome encoding and the randomness mapping.
