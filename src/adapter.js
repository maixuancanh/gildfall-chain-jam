import { connectGameToHost } from '@chain-protocol/casino-sdk/guest';
import { encodeSlotBet, decodeSlotBet, decodeSlotOutcome } from './slot-codec.js';
import { payoutFor, MAX_WAGER } from './math.js';
import { freshLedger, openDemo, finishDemo } from './ledger.js';

const terminal = row => row.phaseName === 'SETTLED' || row.phase === 3;
const cancelled = row => ['CANCELLED', 'FORFEITED'].includes(row.phaseName) || [4,5].includes(row.phase);
const randomWord = () => '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');
export function createAdapter(notify) {
  const embedded = window.parent !== window;
  let api, connection, handshakeTimeout, reconnectTimer, connectGeneration = 0, snapshot, opening = false, storedKey = '', namespace = '', destroyed = false;
  let demoLedger = freshLedger();
  let state = { mode: embedded ? 'host' : 'demo', ready: !embedded, decimals: 2, symbol: 'USDC', balance: undefined, current: null, history: [], message: embedded ? 'Connecting to Chain host…' : 'Practice USDC · no money at stake' };
  const emit = () => { if (!destroyed) notify({ ...state }); };
  function syncDemo() { state={...state,ready:true,balance:demoLedger.balance,current:demoLedger.current,history:demoLedger.history}; emit(); }
  function transact(fn) { demoLedger=fn(demoLedger); syncDemo(); }
  function syncHost() {
    if (!snapshot) { state={...state,ready:false,message:'Waiting for host connection…'};emit();return; }
    const address=snapshot.integration?.gameAddress?.toLowerCase();
    const nextNamespace=`jinxwell.host.${snapshot.integration?.chainId}.${address}.${snapshot.wallet.smartWalletAddress ?? snapshot.wallet.address}`;
    if(namespace!==nextNamespace){ namespace=nextNamespace; storedKey='';state.current=null;try{storedKey=sessionStorage.getItem(namespace)||'';}catch{} }
    const rows=(snapshot.sessions?.items||[]).filter(row=>row.gameAddress?.toLowerCase()===address);
    const row=rows.find(r=>r.sessionKey===storedKey) || (!opening ? rows.find(r=>!terminal(r)&&!cancelled(r)) : null);
    state={...state,ready:!!api && snapshot.wallet?.status==='ready',decimals:snapshot.token?.decimals??18,symbol:snapshot.token?.symbol||'tokens',balance:snapshot.balances?.smartWalletBalance ?? snapshot.balances?.smartVaultBalance,message:snapshot.wallet?.status==='ready'?'Chain host · verifiable settlement':`Wallet: ${snapshot.wallet?.status||'unavailable'}`};
    state.history=rows.filter(terminal).map(r=>{try{if(!r.raw?.gameData||!r.raw?.gameState||r.payout===undefined)return null;const bet=decodeSlotBet(r.raw.gameData),outcome=decodeSlotOutcome(r.raw.gameState,bet),wager=r.wager??r.stake;if(!outcome||payoutFor(BigInt(wager),outcome.multiplierBps)!==BigInt(r.payout))return null;return{id:r.sessionId,...bet,outcome,wager,payout:r.payout,settledAt:r.settledAt??r.lastEventTimestamp};}catch{return null;}}).filter(Boolean).sort((a,b)=>Number(b.settledAt??0)-Number(a.settledAt??0)).slice(0,12);
    if(row){
      storedKey=row.sessionKey; try{sessionStorage.setItem(namespace,storedKey);}catch{}
      if(cancelled(row)) state.current={id:row.sessionId,cancelled:true,revealed:true,label:row.phaseName||'Round closed'};
      else if(row.raw?.gameData){
        try {
          const bet=decodeSlotBet(row.raw.gameData);
          const previous=state.current;
          const outcome=terminal(row) ? decodeSlotOutcome(row.raw.gameState, bet) : null;
          state.current={id:row.sessionId,sessionKey:row.sessionKey,...bet,wager:row.wager??row.stake,outcome,randomness:row.raw?.randomness,payout:row.payout,phase:row.phaseName,createdAt:row.openedAt,revealed:previous?.id===row.sessionId&&previous.revealed};
          // A result without host-confirmed payout is incomplete. Never turn an absent value into zero.
          if(outcome && row.payout===undefined) state.current.outcome=null;
          if(outcome && row.payout!==undefined && payoutFor(BigInt(state.current.wager),outcome.multiplierBps)!==BigInt(row.payout)) { state.current.outcome=null;state.ready=false;state.message='Settlement mismatch. Waiting for a consistent host snapshot.'; }
        } catch { state.ready=false;state.message='Waiting for complete, compatible session data…'; }
      }
    }
    emit();
  }
  return {
    get state(){return state;},
    init(){
      if(!embedded){syncDemo();return;}
      const connectAttempt=()=>{
        const generation=++connectGeneration;
        connection?.destroy();
        connection=connectGameToHost({setState:async value=>{if(generation===connectGeneration){snapshot=value;clearTimeout(handshakeTimeout);clearInterval(reconnectTimer);syncHost();}}});
        connection.promise.then(host=>{if(destroyed||generation!==connectGeneration)return;clearTimeout(handshakeTimeout);if(snapshot)clearInterval(reconnectTimer);api=host;syncHost();api.reportContentSize?.({minHeight:document.documentElement.scrollHeight}).catch(()=>{});}).catch(()=>{});
      };
      connectAttempt();
      reconnectTimer=setInterval(()=>{if(!snapshot&&!destroyed){api=undefined;connectAttempt();}},2500);
      handshakeTimeout=setTimeout(()=>{if(!snapshot&&!destroyed){clearInterval(reconnectTimer);state.ready=false;state.message='Host connection timed out. Reload the whole host page to reconnect.';emit();}},12000);
    },
    maxWager(){return embedded ? null : 10000n;},
    async open(bet){
      if(opening||!state.ready)throw new Error('Wait for the game to be ready.');
      if(state.current&&!state.current.revealed)throw new Error('There is already an active haul.');
      const wager=BigInt(bet.wager);
      if(wager<=0n)throw new Error('Wager must be greater than zero.');
      if(wager>MAX_WAGER)throw new Error('This wager exceeds the game contract limit.');
      if(state.balance===undefined||wager>BigInt(state.balance))throw new Error('Not enough balance for this wager.');
      if (!embedded && wager > this.maxWager()) throw new Error('This wager exceeds the practice limit.');
      opening=true;
      try{
        if(!embedded){await transact(ledger=>openDemo(ledger,{...bet,randomness:randomWord(),id:crypto.randomUUID()}));return;}
        const gameData = encodeSlotBet(bet.route, bet.depth);
        const accountScope = namespace;
        const host = api;
        const limit = await host.getMaxWager({ gameData });
        if (namespace !== accountScope || api !== host || !state.ready || wager > BigInt(state.balance ?? '0')) {
          throw new Error('Host account or balance changed during the wager check.');
        }
        if (limit?.kind !== 'no-limit' && (limit?.kind !== 'limit' || wager > BigInt(limit.maxWager))) {
          throw new Error('Wager exceeds host limits or the limit is unavailable.');
        }
        state.current=null;
        const result=await host.openSession({wager:wager.toString(),gameData});
        storedKey=result.sessionKey;try{sessionStorage.setItem(namespace,storedKey);}catch{}
        state.current={...bet,id:storedKey,sessionKey:storedKey,outcome:null,revealed:false};syncHost();
      }finally{opening=false;}
    },
    async finish(id){
      if(!embedded){await transact(ledger=>finishDemo(ledger,id));return;}
      if(state.current?.id!==id||!state.current.outcome)return;
      await api.revealOutcome({sessionId:id});
      state.current={...state.current,revealed:true};
      if(!state.history.some(r=>r.id===id))state.history=[state.current,...state.history].slice(0,12);emit();
    },
    async reset(){
      if(embedded)throw new Error('Reset is only available in practice mode.');
      if(demoLedger.current&&!demoLedger.current.revealed)throw new Error('Finish your haul first.');
      demoLedger=freshLedger();syncDemo();
    },
    async verify(){const id=state.current?.id;if(!embedded)return {supported:false,note:'Practice outcomes use browser randomness; no on-chain VRF proof.'};if(!api?.getRandomnessVerification||!id)return {supported:false,note:'Verification is not provided by this host.'};return api.getRandomnessVerification({sessionId:id});},
    async cancel(){if(!embedded||!state.current||!api?.cancelStuckRandomness)throw new Error('No recoverable host session.');return api.cancelStuckRandomness({sessionId:state.current.id});},
    destroy(){destroyed=true;clearTimeout(handshakeTimeout);clearInterval(reconnectTimer);connection?.destroy();}
  };
}
