import { decodeAbiParameters, encodeAbiParameters, parseAbiParameters } from 'viem';
import { resolveTicket, validateConfig } from './math.js';

export const GAME_DATA_ABI = parseAbiParameters('uint8 route, uint8 depth');
export const GAME_STATE_ABI = parseAbiParameters('uint8 version, uint8 route, uint8 depth, uint8 tier, uint16 ticket, uint32 multiplierBps, bool cut, bool shield, uint16 slashMask, uint16 openedMask, uint8 collectedMask');

export function encodeGameData(route, depth) {
  validateConfig(route, depth);
  return encodeAbiParameters(GAME_DATA_ABI, [route, depth]);
}
export function decodeGameData(hex) {
  const [route, depth] = decodeAbiParameters(GAME_DATA_ABI, hex);
  if (encodeGameData(route, depth).toLowerCase() !== hex.toLowerCase()) throw new RangeError('Noncanonical gameData');
  return { route, depth };
}
export function decodeGameState(hex) {
  if (hex === '0x') return null;
  const values = decodeAbiParameters(GAME_STATE_ABI, hex);
  const [version, route, depth, tier, ticket, multiplierBps, cut, shield, slashMask, openedMask, collectedMask] = values;
  if (version !== 1 || encodeAbiParameters(GAME_STATE_ABI, values).toLowerCase() !== hex.toLowerCase()) throw new RangeError('Invalid state encoding');
  const expected = resolveTicket(route, depth, ticket);
  for (const [key, value] of Object.entries({ tier, multiplierBps, cut, shield, slashMask, openedMask, collectedMask })) if (expected[key] !== value) throw new RangeError(`Inconsistent state: ${key}`);
  return { version, ...expected };
}
