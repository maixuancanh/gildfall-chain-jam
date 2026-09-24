import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, toHex } from 'viem';
import { getPaytable, resolveTicket, payoutFor, drawTicket, quoteRisk, MAX_WAGER } from '../src/math.js';
import { encodeGameData, decodeGameData, decodeGameState, GAME_STATE_ABI } from '../src/codec.js';

test('all 90,000 tickets: exact RTP, masks, distribution, depth and increasing route variance', () => {
  for (let depth = 1; depth <= 3; depth++) {
    let priorSecond = 0n;
    for (let route = 0; route < 3; route++) {
      const table = getPaytable(route, depth), counts = Array(6).fill(0);
      let sum = 0n, squares = 0n;
      assert.equal(table.reduce((s, row) => s + row.weight, 0), 10000);
      for (let ticket = 0; ticket < 10000; ticket++) {
        const o = resolveTicket(route, depth, ticket);
        sum += BigInt(o.multiplierBps); squares += BigInt(o.multiplierBps) ** 2n;
        counts[o.relics.length]++;
        assert.equal(o.tier, depth);
        assert.equal(o.openedMask & ~(31 << (5 * (depth - 1))), 0);
        assert.equal(o.slashMask, o.openedMask);
        assert.equal(o.collectedMask, o.cut && !o.shield ? 0 : o.openedMask >> (5 * (depth - 1)));
        assert.equal(new Set(o.relics).size, o.relics.length);
        assert.equal(o.multiplierBps, table[o.relics.length].multiplierBps);
        assert.ok(o.multiplierBps <= 120000);
        JSON.stringify(o);
      }
      assert.equal(sum, 96000000n);
      assert.deepEqual(counts, table.map(row => row.weight));
      assert.ok(squares > priorSecond); priorSecond = squares;
      assert.deepEqual(resolveTicket(route, depth, 9999).relics, [0, 1, 2, 3, 4]);
    }
  }
});

test('BigInt payout, rounding, exact weighted risk and bounds', () => {
  assert.equal(payoutFor(3n, 5000), 1n);
  assert.equal(payoutFor(MAX_WAGER, 120000), MAX_WAGER * 12n);
  for (const wager of [1n, 3n, 10000n, MAX_WAGER]) for (let r = 0; r < 3; r++) for (let d = 1; d <= 3; d++) {
    const q = quoteRisk(wager, r, d), rows = getPaytable(r, d);
    const meanNumerator = rows.reduce((s, row) => s + BigInt(row.weight) * payoutFor(wager, row.multiplierBps), 0n);
    assert.equal(q.expectedPayout, meanNumerator / 10000n);
    assert.ok(q.expectedPayout <= wager * 96n / 100n);
    assert.ok(q.bodyVarianceScaled > 0n && q.bodyVarianceScaled < 2n ** 256n);
    assert.equal(q.maxPayout, wager + q.maxReservedProfit);
  }
  for (const wager of [0n, -1n, MAX_WAGER + 1n, 1, '1']) assert.throws(() => payoutFor(wager, 10000));
  for (const m of [-1, 120001, NaN, 1.1, 10000n]) assert.throws(() => payoutFor(1n, m));
});

test('invalid configs/tickets and strict ABI round trips', () => {
  for (const [r, d] of [[-1, 1], [3, 1], [0, 0], [0, 4], [0.1, 1], ['0', 1], [0, NaN]]) assert.throws(() => getPaytable(r, d));
  for (const ticket of [-1, 10000, NaN, 1.1, '5']) assert.throws(() => resolveTicket(0, 1, ticket));
  for (let r = 0; r < 3; r++) for (let d = 1; d <= 3; d++) {
    assert.deepEqual(decodeGameData(encodeGameData(r, d)), { route: r, depth: d });
    const o = resolveTicket(r, d, 9999);
    const values = [1, r, d, d, o.ticket, o.multiplierBps, o.cut, o.shield, o.slashMask, o.openedMask, o.collectedMask];
    assert.deepEqual(decodeGameState(encodeAbiParameters(GAME_STATE_ABI, values)), { version: 1, ...o });
    values[5] = 0;
    assert.throws(() => decodeGameState(encodeAbiParameters(GAME_STATE_ABI, values)));
  }
  assert.equal(decodeGameState('0x'), null);
  assert.throws(() => decodeGameData('0x'));
  assert.throws(() => decodeGameData(encodeGameData(0, 1) + '00'));
  assert.throws(() => decodeGameState('0x01'));
});

test('draw uses rejection expansion and strict bytes32 inputs', () => {
  for (const n of [0n, 1n, 9999n, 10000n, 123456789n]) assert.equal(drawTicket(toHex(n, { size: 32 })), Number(n % 10000n));
  const limit = (1n << 256n) / 10000n * 10000n;
  assert.equal(drawTicket(toHex(limit - 1n, { size: 32 })), 9999);
  for (const n of [limit, (1n << 256n) - 1n]) assert.ok(drawTicket(toHex(n, { size: 32 })) < 10000);
  for (const bad of ['0x', '0x12', '0x' + 'gg'.repeat(32), 0n, null]) assert.throws(() => drawTicket(bad));
});
