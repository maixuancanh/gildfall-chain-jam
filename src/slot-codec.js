import { getPaytable, resolveTicket, validateConfig } from './math.js';

export function encodeSlotBet(route, depth) {
  validateConfig(route, depth);
  return '0x' + (route * 3 + depth - 1).toString(16).padStart(2, '0');
}

export function decodeSlotBet(value) {
  if (value === '0x') value = '0x00';
  if (!/^0x0[0-8]$/.test(value)) throw new RangeError('Invalid slot configuration');
  const index = Number(value);
  return { route: Math.floor(index / 3), depth: index % 3 + 1 };
}

export function decodeSlotOutcome(value, { route, depth }) {
  if (value === '0x' || value == null) return null;
  if (!/^0x[0-9a-f]{8}$/i.test(value)) throw new RangeError('Invalid slot result');
  const prize = Number(value);
  let ticket = 0;
  for (const tier of getPaytable(route, depth)) {
    // All tickets in this tier render the same haul.
    if (tier.weight > 0 && tier.multiplierBps === prize) return resolveTicket(route, depth, ticket);
    ticket += tier.weight;
  }
  throw new RangeError('Unknown prize for this configuration');
}
