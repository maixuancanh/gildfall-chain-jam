# Jinxwell Chain Jam math and contract

This conversion is a precommitted chance game. The player selects route 0–2 and depth 1–3 before one VRF request. A single outcome settles the entire haul. The animation depicts an angler descending on a rope elevator, opening chests, a strike against the cable, Boom protecting the haul, and recovered relics. Tap-to-aim, timing and animation do not change the award.

## Finite joint outcome model

There are exactly 10,000 tickets, numbered 0–9999, partitioned into six contiguous bands in table order. Each band determines the whole joint event, not independent rolls. Depth selects tier 1, 2 or 3: five chest positions in each tier, with chest/slash bit positions `5*(depth-1)` through `5*depth-1`. The collected mask uses local relic bits 0–4: Crown, Chalice, Compass, Idol and Prism.

| Band | Opened local mask | Rope strike (`cut`) | Boom (`shield`) | Collected | Payout |
|---|---:|---|---|---|---:|
| Severed haul | 31 | true | false | none | 0× |
| One relic | 1 | false | false | Crown | 0.5× |
| Boom rescue | 3 | true | true | first two | 1× |
| Three relics | 7 | false | false | first three | 2× |
| Four relics | 15 | false | true | first four | 4× |
| Five relic jackpot | 31 | true | true | all five distinct | 6× / 9× / 12× by depth |

The legacy `slashMask` field equals the opened mask: each bit represents one opened chest in the selected tier. The render groups those openings around the chosen visual target; this never changes the mathematical result. A cable strike without Boom discards the complete haul; otherwise collected relics equal opened local chests. Payout is determined from collected count and depth. `cut=true` describes the strike, not necessarily a severed cable. Boom appears on some safe paths as well as protected strikes.

These are explicitly weighted authored outcome bands. Chest locations and animated trajectories illustrate the selected tier and correlated events; weights are not derived from physical collision areas, real-time skill, or independent geometric hit probabilities. Restricting reachable masks to prefix sets is intentional and keeps the joint model auditable.

| Route | Depth | 0× | 0.5× | 1× | 2× | 4× | Top | Top multiplier |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sheltered Bend | 1 | 1775 | 4000 | 2500 | 1000 | 625 | 100 | 6× |
| Sheltered Bend | 2 | 1850 | 4000 | 2500 | 1000 | 550 | 100 | 9× |
| Sheltered Bend | 3 | 1925 | 4000 | 2500 | 1000 | 475 | 100 | 12× |
| Monster Run | 1 | 3425 | 2600 | 2000 | 1000 | 775 | 200 | 6× |
| Monster Run | 2 | 3575 | 2600 | 2000 | 1000 | 625 | 200 | 9× |
| Monster Run | 3 | 3725 | 2600 | 2000 | 1000 | 475 | 200 | 12× |
| Jinxwell Rift | 1 | 5350 | 1000 | 1500 | 800 | 1050 | 300 | 6× |
| Jinxwell Rift | 2 | 5575 | 1000 | 1500 | 800 | 825 | 300 | 9× |
| Jinxwell Rift | 3 | 5800 | 1000 | 1500 | 800 | 600 | 300 | 12× |

Every row sums to 10,000; every weighted multiplier sum is 96,000,000 basis points, giving exactly 0.96 expected gross return per unit wager before integer rounding. At each depth payout variance strictly increases from route 0 to route 2. Increasing depth targets a different chest tier, raises the jackpot and transfers weight from the 4× band to the zero band. Top awards require all five distinct relics. Gross payout includes returned stake; 0.5× loses half, 1× breaks even.

## Integer payout and risk

All money uses BigInt in JS and uint256 in Solidity. Wagers must be in `[1, 10^24]` base units, independently of any stricter host/vault limits. `payout = floor(wager * multiplierBps / 10000)`. For odd wagers the 0.5× award rounds down, so actual RTP is slightly below 96%; for even wagers every award is integral and RTP is exactly 96%. The maximum payout is 12× wager. Caps reserve `maxPayout - wager` and use the same payout function as settlement.

For band weight `w_i` and rounded payout `P_i`, let `S = sum(w_i*P_i)`, `B = sum_except_top(w_i*P_i)` and `Q = sum_except_top(w_i*P_i^2)`:

- `expectedPayout = floor(S / 10000)`.
- `probabilityWad = topWeight * 10^14` (1%, 2%, or 3%).
- `bodyVarianceScaled = Q*10^14 - B^2*10^10`.

Body variance sets jackpot payouts to zero and retains the original probabilities; it is not a conditional distribution. This matches SDK 0.4.0 `docs/SLOTS_RISK_AND_RESERVES.md`. Since 10,000² divides 10^18, the scaled variance formula is exact even at tiny wagers. The largest intermediate at the maximum wager is bounded by `(10000*12*10^24)^2*10^10 = 1.44*10^68`, below uint256 capacity. Signed reserve conversion is also safe.

## Randomness

Interpret the bytes32 VRF word as a big-endian uint256. Accept only words less than `L = floor(2^256/10000)*10000`, then return `word % 10000`. For rejected words, try `keccak256(abi.encode(originalSeed, uint256 counter))` with counter 1, 2, … until accepted. JS and Solidity use the identical encoding and threshold. A direct modulo fallback is never used. Rejection probability per uniform word is less than 10000/2^256.

Rejection sampling removes modulo bias under the standard uniform VRF / pseudorandom hash-expansion model. A deterministic mapping of a finite 256-bit seed space cannot literally partition all seeds equally among 10,000 tickets; the exact 96% proof is for the uniform-ticket model. The hash expansion has the usual cryptographic assumption and theoretical unbounded loop, with negligible probability of even one rejection under an honest VRF. No further VRF request is made.

## ABI and lifecycle

Game data is exactly `abi.encode(uint8 route, uint8 depth)` (64 bytes). Empty, trailing, out-of-range and noncanonical inputs are rejected. Settled game state is the static tuple below (352 bytes), equivalently `abi.encode(Outcome)`:

```solidity
uint8 version; // 1
uint8 route;
uint8 depth;
uint8 tier; // equal to depth
uint16 ticket;
uint32 multiplierBps;
bool cut;
bool shield;
uint16 slashMask;
uint16 openedMask;
uint8 collectedMask;
```

Pending game state is `0x`; `decodeGameState('0x')` returns null. Other malformed or inconsistent states throw. The decoder verifies all fields against the ticket model and returns the derived relic IDs and label. `resolveTicket` is JSON-friendly; money remains BigInt.

`JinxwellGame` imports the actual vendor `ICasinoGameV2.sol`. Its `StepResult` has six fields; the extra `outcome` field mentioned in one SDK prose page is not in the source interface and is not used. Start validates escrow, commits reserve and requests randomness. Randomness returns SETTLED, one award and the state above, with both deltas zero. The host releases the reserve after enforcing the cap. All player actions revert; forfeit value is always zero. The stateless game relies on the host's authenticated committed context and phase/replay checks, as required by the SDK.

## Verification

Run `node --test tests/math.test.js tests/contract.test.js` and `node scripts/check-contract.mjs`. The math suite enumerates all 90,000 tickets. The contract suite compiles against the actual SDK, deploys to in-process Ganache, compares both ends of every band in all nine configurations, checks ABI settlement, caps, rounded risk at four wager sizes, rejection-expansion seeds, invalid inputs and no-action behavior. This is local EVM evidence, not deployment, host integration, audit or live VRF evidence. Dependencies are `viem`, `solc` and `ganache`; no ethers dependency is needed.
