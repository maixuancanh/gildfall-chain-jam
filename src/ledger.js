import { resolveTicket, payoutFor, drawTicket } from './math.js';
export const LEDGER_KEY = 'jinxwell-chain-jam.demo.v1';
export const freshLedger = () => ({ version: 1, balance: '100000', current: null, history: [] });
export function openDemo(ledger, { route, depth, wager, randomness, id }) {
  if (ledger.current && !ledger.current.revealed) throw new Error('Finish the current haul first.');
  const stake = BigInt(wager);
  if (stake < 100n || stake > 10000n || stake > BigInt(ledger.balance)) throw new Error('Choose a wager from 1 to 100 USDC within your balance.');
  const outcome = resolveTicket(route, depth, drawTicket(randomness));
  return { ...ledger, balance: (BigInt(ledger.balance) - stake).toString(), current: { id, route, depth, wager: stake.toString(), payout: payoutFor(stake, outcome.multiplierBps).toString(), outcome, randomness, createdAt: Date.now(), revealed: false } };
}
export function finishDemo(ledger, id) {
  if (!ledger.current || ledger.current.id !== id || ledger.current.revealed) return ledger;
  const record = { ...ledger.current, revealed: true };
  return { ...ledger, balance: (BigInt(ledger.balance) + BigInt(record.payout)).toString(), current: record, history: [record, ...ledger.history].slice(0, 12) };
}
