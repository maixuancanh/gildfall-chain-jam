import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaytable } from '../src/math.js';
import { decodeSlotBet, decodeSlotOutcome, encodeSlotBet } from '../src/slot-codec.js';

test('all nine Slot Engine tables and displayed hauls match the practice paytable', () => {
  const title = JSON.parse(readFileSync(new URL('../slot/title.json', import.meta.url)));
  assert.equal(title.betConfigurations.length, 9);
  for (const [index, configuration] of title.betConfigurations.entries()) {
    const bet = { route: Math.floor(index / 3), depth: index % 3 + 1 };
    assert.equal(Number(encodeSlotBet(bet.route, bet.depth)), index);
    assert.deepEqual(decodeSlotBet(encodeSlotBet(bet.route, bet.depth)), bet);
    const csv = readFileSync(new URL('../slot/' + configuration.tierList, import.meta.url), 'utf8');
    const tiers = csv.trim().split(/\r?\n/).slice(1).map(line => {
      const [prize, weight] = line.split(',').map(Number);
      return { multiplierBps: prize * configuration.prizeDenominator, weight };
    });
    assert.deepEqual(tiers, getPaytable(bet.route, bet.depth).map(({ multiplierBps, weight }) => ({ multiplierBps, weight })));
    for (const { multiplierBps } of tiers) {
      const state = '0x' + multiplierBps.toString(16).padStart(8, '0');
      assert.equal(decodeSlotOutcome(state, bet).multiplierBps, multiplierBps);
    }
    assert.throws(() => decodeSlotOutcome('0xffffffff', bet));
  }
});
