import test from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient, createWalletClient, custom, toHex, zeroAddress } from 'viem';
import { compileContract } from '../scripts/check-contract.mjs';
import { getPaytable, resolveTicket, payoutFor, quoteRisk, drawTicket, MAX_WAGER } from '../src/math.js';
import { encodeGameData, decodeGameState } from '../src/codec.js';

test('compiled canonical SDK contract: bands, RNG, risk, lifecycle and JS parity', { timeout: 120000 }, async () => {
  const provider = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'shanghai' }, wallet: { deterministic: true } });
  try {
    const transport = custom(provider), client = createPublicClient({ transport }), wallet = createWalletClient({ transport });
    const [account] = await wallet.getAddresses();
    const artifact = compileContract();
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: account, data: `0x${artifact.evm.bytecode.object}`, gas: '0x600000' }] });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success');
    const read = (functionName, args = []) => client.readContract({ address: receipt.contractAddress, abi: artifact.abi, functionName, args });
    for (let route = 0; route < 3; route++) for (let depth = 1; depth <= 3; depth++) {
      const rows = getPaytable(route, depth), data = encodeGameData(route, depth);
      const [weights, mults] = await read('paytable', [route, depth]);
      assert.deepEqual(weights, rows.map(row => BigInt(row.weight)));
      assert.deepEqual(mults, rows.map(row => row.multiplierBps));
      let start = 0;
      for (const row of rows) {
        for (const ticket of [start, start + row.weight - 1]) {
          const actual = await read('resolveTicket', [route, depth, ticket]), expected = resolveTicket(route, depth, ticket);
          for (const key of Object.keys(actual)) assert.equal(actual[key], key === 'version' ? 1 : expected[key], key);
          const risk = quoteRisk(10001n, route, depth);
          const ctx = { sessionId: 1n, player: account, vault: zeroAddress, wagerBase: 10001n, escrowedStake: 10001n, reservedProfit: risk.maxReservedProfit, step: 1, gameData: data, gameState: '0x' };
          const result = await read('onRandomness', [ctx, toHex(ticket, { size: 32 })]);
          assert.deepEqual(decodeGameState(result.newGameState), { version: 1, ...expected });
          assert.equal(result.payout, payoutFor(ctx.wagerBase, expected.multiplierBps));
          assert.equal(result.nextPhase, 3); assert.equal(result.requestRandomnessNow, false);
          assert.equal(result.escrowDelta, 0n); assert.equal(result.reservedProfitDelta, 0n);
          assert.ok(result.payout <= ctx.escrowedStake + ctx.reservedProfit);
          if (ticket === 9999) await assert.rejects(read('onRandomness', [{ ...ctx, gameState: result.newGameState }, toHex(1, { size: 32 })]));
        }
        start += row.weight;
      }
      for (const wager of [1n, 3n, 10001n, MAX_WAGER]) {
        const q = quoteRisk(wager, route, depth);
        assert.deepEqual(await read('quoteCaps', [wager, data]), [wager, q.maxReservedProfit]);
        assert.deepEqual(await read('quoteRiskParams', [wager, data]), [q.maxPayout, q.probabilityWad, q.expectedPayout, q.bodyVarianceScaled]);
      }
      const ctx = { sessionId: 1n, player: account, vault: zeroAddress, wagerBase: 3n, escrowedStake: 3n, reservedProfit: 0n, step: 0, gameData: data, gameState: '0x' };
      const pending = await read('onSessionStart', [ctx]);
      assert.equal(pending.nextPhase, 1); assert.equal(pending.requestRandomnessNow, true);
      assert.equal(pending.reservedProfitDelta, quoteRisk(3n, route, depth).maxReservedProfit);
      assert.equal(pending.newGameState, '0x'); assert.equal(pending.payout, 0n);
      assert.equal(await read('quoteForfeitPayout', [ctx]), 0n);
      await assert.rejects(read('onPlayerAction', [ctx, '0x']));
      await assert.rejects(read('onRandomness', [ctx, toHex(9999, { size: 32 })]));
    }
    const limit = (1n << 256n) / 10000n * 10000n;
    for (const n of [0n, 9999n, 10000n, limit - 1n, limit, limit + 1n, (1n << 256n) - 1n]) {
      const seed = toHex(n, { size: 32 }); assert.equal(await read('drawTicket', [seed]), drawTicket(seed));
    }
    for (const wager of [0n, MAX_WAGER + 1n]) await assert.rejects(read('quoteRiskParams', [wager, encodeGameData(0, 1)]));
    await assert.rejects(read('quoteCaps', [1n, '0x']));
    await assert.rejects(read('quoteCaps', [1n, encodeGameData(0, 1) + '00']));
    await assert.rejects(read('resolveTicket', [3, 1, 0]));
    await assert.rejects(read('resolveTicket', [0, 0, 0]));
    await assert.rejects(read('resolveTicket', [0, 1, 10000]));
  } finally { await provider.disconnect(); }
});
