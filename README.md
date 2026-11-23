# Gildfall

Gildfall is a treasure-haul casino game made for the Chain casino SDK. Choose a route, depth and wager, then send an angler down into the cavern to collect relics from a row of chests. A cable strike can wipe out a haul; a Boom shield can save it. Collect all five relics for the highest payout at the chosen depth.

[Play the standalone demo](https://gildfall-chain-jam.pages.dev/). It uses practice USDC, not a wallet or real money. Press **ENTER**, choose a route and depth, set your wager, then press **CAST** or aim at a chest. The route, depth and wager are locked before the random draw. Where you aim and how long the animation runs do not change the odds.

## Use it with the Chain casino SDK

Run the standalone game locally with Node.js 24.12.4 or newer:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:4188/> for practice. To use the Chain simulator, keep the game server running and start this in another terminal:

```sh
npx --package=@chain-protocol/cli@0.7.0 chain dev casino --frontend-url http://127.0.0.1:4188
```

Open the simulator URL and select Gildfall.

## How the SDK fits into Gildfall

`deployment.ts` points Chain at the Slot Engine title in `slot/title.json`. Each route and depth combination has its own weighted table. The guest checks the host wager limit for that configuration before opening a session.

The Slot Engine settles the payout. The guest checks the reported amount against the paytable and plays a matching haul before revealing the result. Practice uses the same odds with browser randomness. The original Solidity contract remains for parity checks.

Run `npm test` and `npm run build` to verify the paytables, playback mapping, reference contract and frontend build.

## How RTP is calculated

Each route/depth pair divides 10,000 equally likely tickets among six payout bands: 0×, 0.5×, 1×, 2×, 4× and a depth-dependent top payout of 6×, 9× or 12×. Multipliers are **gross returns**, including any returned stake. For each band, multiply its ticket count by its payout multiplier, add the results and divide by 10,000.

For example, Sheltered Bend at depth 1 has 1,775 tickets at 0×, 4,000 at 0.5×, 2,500 at 1×, 1,000 at 2×, 625 at 4× and 100 at 6×:

```text
RTP = (1,775×0 + 4,000×0.5 + 2,500×1 + 1,000×2 + 625×4 + 100×6) / 10,000
    = 9,600 / 10,000
    = 96%
```

All nine route/depth paytables use the same weighted gross RTP of 96% before integer rounding. Routes change the volatility; deeper tiers increase the top payout and move some probability from 4× to 0×. The actual payout is `floor(wager × multiplierBps / 10,000)` in base units, so a 0.5× payout can round down for an odd-unit wager. The [math and contract notes](docs/MATH.md) list every ticket weight, the outcome encoding and the randomness mapping.
