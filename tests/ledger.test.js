import test from 'node:test';
import assert from 'node:assert/strict';
import {freshLedger,openDemo,finishDemo} from '../src/ledger.js';
const bet={route:1,depth:2,wager:'1000',randomness:'0x'+'0'.repeat(60)+'270f',id:'test'};
test('stake debited once and cannot double-open',()=>{const l=openDemo(freshLedger(),bet);assert.equal(l.balance,'99000');assert.throws(()=>openDemo(l,bet));});
test('settlement is idempotent across reloads',()=>{const l=JSON.parse(JSON.stringify(openDemo(freshLedger(),bet)));const settled=finishDemo(l,'test');assert.equal(BigInt(settled.balance),99000n+BigInt(l.current.payout));assert.deepEqual(finishDemo(settled,'test'),settled);assert.equal(settled.history.length,1);});
test('wrong id cannot settle',()=>{const l=openDemo(freshLedger(),bet);assert.equal(finishDemo(l,'wrong'),l);});
test('invalid stakes rejected before debit',()=>{for(const wager of ['0','99','10001','-100'])assert.throws(()=>openDemo(freshLedger(),{...bet,wager}));});
