import { encodeAbiParameters, keccak256 } from 'viem';

export const DENOMINATOR = 10000;
export const RTP_BPS = 9600;
export const MIN_WAGER = 1n;
export const MAX_WAGER = 10n ** 24n;
export const ROUTES = Object.freeze([
  { id: 0, name: 'Sheltered Bend', description: 'Lower volatility; more partial recoveries.' },
  { id: 1, name: 'Monster Run', description: 'Medium volatility; more empty hauls and larger recoveries.' },
  { id: 2, name: 'Jinxwell Rift', description: 'Higher volatility; the best chance of all five relics.' },
].map(Object.freeze));
export const RELICS = Object.freeze(['Crown', 'Chalice', 'Compass', 'Idol', 'Prism']);
const LABELS = ['Severed haul', 'One relic', 'Boom rescue', 'Three relics', 'Four relics', 'Five relic jackpot'];

export function validateConfig(route, depth) {
  if (!Number.isInteger(route) || route < 0 || route > 2 || !Number.isInteger(depth) || depth < 1 || depth > 3) throw new RangeError('Invalid route/depth');
}
export function validateWager(wager) {
  if (typeof wager !== 'bigint' || wager < MIN_WAGER || wager > MAX_WAGER) throw new RangeError('Wager must be BigInt in [1, 10^24] base units');
}
export function getPaytable(route, depth) {
  validateConfig(route, depth);
  const top = 3 + 3 * depth;
  const weights = [0, [4000, 2600, 1000][route], [2500, 2000, 1500][route], [1000, 1000, 800][route], 0, (route + 1) * 100];
  weights[4] = (9600 - weights[1] / 2 - weights[2] - 2 * weights[3] - top * weights[5]) / 4;
  weights[0] = 10000 - weights.reduce((a, b) => a + b, 0);
  return weights.map((weight, band) => ({ name: LABELS[band], weight, multiplierBps: [0, 5000, 10000, 20000, 40000, top * 10000][band], band, tier: depth }));
}

export function resolveTicket(route, depth, ticket) {
  const table = getPaytable(route, depth);
  if (!Number.isInteger(ticket) || ticket < 0 || ticket >= DENOMINATOR) throw new RangeError('Invalid ticket');
  let cumulative = 0;
  const band = table.findIndex(row => ticket < (cumulative += row.weight));
  const cut = band === 0 || band === 2 || band === 5;
  const shield = band === 2 || band === 4 || band === 5;
  const openedLocal = band === 0 ? 31 : (1 << band) - 1;
  const openedMask = openedLocal << (5 * (depth - 1));
  const collectedMask = cut && !shield ? 0 : openedLocal;
  const relics = RELICS.map((_, i) => i).filter(i => collectedMask & (1 << i));
  const multiplierBps = [0, 5000, 10000, 20000, 40000, (3 + 3 * depth) * 10000][relics.length];
  return { ticket, route, depth, tier: depth, multiplierBps, cut, shield, slashMask: openedMask, openedMask, collectedMask, relics, label: LABELS[band] };
}

export function payoutFor(wager, multiplierBps) {
  validateWager(wager);
  if (!Number.isInteger(multiplierBps) || multiplierBps < 0 || multiplierBps > 120000) throw new RangeError('Invalid multiplier');
  return wager * BigInt(multiplierBps) / 10000n;
}

// A rejected word is expanded with keccak256(abi.encode(originalSeed, counter)), counter starts at 1.
export function drawTicket(randomness) {
  if (typeof randomness !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(randomness)) throw new TypeError('Expected bytes32 hex');
  const limit = (1n << 256n) / 10000n * 10000n;
  let word = BigInt(randomness), counter = 0n;
  while (word >= limit) word = BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [randomness, ++counter])));
  return Number(word % 10000n);
}

export function quoteRisk(wager, route, depth) {
  validateWager(wager);
  const table = getPaytable(route, depth);
  let sum = 0n, bodySum = 0n, bodySquaredSum = 0n;
  for (const row of table) {
    const p = payoutFor(wager, row.multiplierBps), w = BigInt(row.weight);
    sum += w * p;
    if (row.band !== 5) { bodySum += w * p; bodySquaredSum += w * p * p; }
  }
  const maxPayout = payoutFor(wager, table[5].multiplierBps);
  return { maxPayout, maxReservedProfit: maxPayout - wager, probabilityWad: BigInt(table[5].weight) * 10n ** 14n, expectedPayout: sum / 10000n, bodyVarianceScaled: bodySquaredSum * 10n ** 14n - bodySum * bodySum * 10n ** 10n };
}
