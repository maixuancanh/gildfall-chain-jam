import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioSystem } from '../src/audio.js';

class FakeGain {
  constructor() { this.gain = { value: 1, setValueAtTime: (value) => { this.gain.value = value; }, exponentialRampToValueAtTime() {} }; }
  connect() { return this; }
}

class FakeOscillator {
  constructor() { this.frequency = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
  connect() { return this; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.gains = []; this.oscillators = []; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createOscillator() { const oscillator = new FakeOscillator(); this.oscillators.push(oscillator); return oscillator; }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

test('quake adds cached noise sources that pause, mute and Boom stop',async()=>{
  class NoiseContext extends FakeAudioContext {
    constructor(){super();this.sampleRate=8000;this.buffers=0;this.sources=[];}
    createBuffer(channels,length){this.buffers++;return{getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){const source=new FakeOscillator();source.disconnect=()=>{};this.sources.push(source);return source;}
    createBiquadFilter(){return{frequency:{value:0},Q:{value:0},connect(){},disconnect(){}};}
  }
  const audio=createAudioSystem({AudioContextCtor:NoiseContext,storage:null});
  await audio.unlockFromGesture();
  audio.handleEvents([{kind:'quake-rumble',id:'q1'},{kind:'rock-impact',id:'r1'}]);
  assert.ok(audio.context.sources.length>=2);
  assert.equal(audio.context.buffers,1);
  audio.setPaused(true);assert.ok(audio.context.sources.every(s=>s.stopped));
  audio.setPaused(false);audio.handleEvents([{kind:'quake-rumble',id:'q2'}]);
  const last=audio.context.sources.at(-1);last.stopped=false;
  audio.handleEvents([{kind:'boom-attack',id:'b1'}]);assert.equal(last.stopped,true);
  audio.setMuted(true);assert.equal(audio.handleEvents([{kind:'quake-rumble',id:'q3'}]),0);
});

function fakeStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('decoded stone samples replace pitched quake tones and repeat cues do not restart a sample',async()=>{
  class SampleContext extends FakeAudioContext {
    constructor(){super();this.sources=[];}
    async decodeAudioData(){return{duration:1};}
    createBufferSource(){const source=new FakeOscillator();source.playbackRate={value:1};this.sources.push(source);return source;}
  }
  const audio=createAudioSystem({AudioContextCtor:SampleContext,storage:null});
  audio.setSounds(new Map(['rock-break','boulder-drop','boulder-move'].map(key=>[key,{encodedBytes:new ArrayBuffer(8)}])));
  await audio.unlockFromGesture();
  audio.handleEvents([{kind:'quake-rumble',id:'q1'},{kind:'quake-rumble',id:'q2'},{kind:'rock-impact',id:'r1'}]);
  assert.equal(audio.context.sources.length,1);
  audio.context.sources[0].onended();
  audio.context.currentTime=.2;
  audio.handleEvents([{kind:'rock-impact',id:'r2'}]);
  assert.equal(audio.context.sources.length,1,'silence after the first sample');
  audio.context.currentTime=3;
  audio.handleEvents([{kind:'rock-impact',id:'r3'}]);
  assert.equal(audio.context.sources.length,2);
  assert.equal(audio.context.oscillators.length,0);
});

test('audio remains locked until a gesture, then maps each event ID once', async () => {
  const audio = createAudioSystem({ AudioContextCtor: FakeAudioContext, storage: fakeStorage() });
  audio.handleEvents([{ id: 'capture-1', kind: 'capture' }]);
  assert.equal(audio.locked, true);
  assert.equal(audio.playedEventCount, 0);

  await audio.unlockFromGesture();
  audio.handleEvents([
    { id: 'capture-1', kind: 'capture' },
    { id: 'rage-1', kind: 'rage-telegraph' },
    { id: 'rage-1', kind: 'rage-telegraph' },
  ]);

  assert.equal(audio.locked, false);
  assert.equal(audio.playedEventCount, 2);
  assert.equal(audio.context.oscillators.length, 2);
});

test('major gameplay cues have audio and retry clears event deduplication', async () => {
  const audio = createAudioSystem({ AudioContextCtor: FakeAudioContext, storage: fakeStorage() });
  await audio.unlockFromGesture();
  const events = ['boom-attack','treasure-open','mystery-reveal','haul-resolve','bank-mythic','slash','time-up','victory','ui-click','stun-end','elevator-arrive'].map(kind=>({kind,id:kind}));
  assert.equal(audio.handleEvents(events), events.length);
  assert.equal(audio.handleEvents(events), 0);
  audio.reset();
  assert.equal(audio.handleEvents(events), events.length);
});

test('mute and pause stop a playing authored slash sound', async () => {
  const audio = createAudioSystem({ AudioContextCtor: FakeAudioContext, storage: fakeStorage() });
  let paused = 0;
  const sound = { volume:1, currentTime:0, play:async()=>{}, pause(){paused++;} };
  audio.setSounds(new Map([['treasure-slash',sound]]));
  await audio.unlockFromGesture();
  audio.handleEvents([{id:'slash-1',kind:'slash'}]);
  audio.setMuted(true);
  assert.ok(paused > 0);
});

test('master, effects, music, and persistent mute are independently exposed', async () => {
  const storage = fakeStorage();
  const audio = createAudioSystem({ AudioContextCtor: FakeAudioContext, storage });
  await audio.unlockFromGesture();

  audio.setGains({ master: 0.7, effects: 0.4, music: 0.2 });
  audio.setMuted(true);
  const restored = createAudioSystem({ AudioContextCtor: FakeAudioContext, storage });

  assert.deepEqual(audio.gains, { master: 0.7, effects: 0.4, music: 0.2 });
  assert.equal(audio.muted, true);
  assert.equal(restored.muted, true);
  assert.equal(restored.setMuted(false), false);
  assert.equal(restored.muted, false);
});

test('one looping background track attempts autoplay and retries after a blocked attempt', async () => {
  const audio = createAudioSystem({ AudioContextCtor: FakeAudioContext, storage: fakeStorage() });
  let attempts = 0;
  const track = {
    currentTime: 0, volume: 1, paused: true, ended: false,
    play() { attempts++; if (attempts === 1) return Promise.reject(new Error('NotAllowedError')); this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
  audio.setSounds(new Map([['bgm', track]]));
  audio.startMenuMusic();
  assert.equal(attempts, 0);
  audio.attemptAutoplayMusic();
  assert.equal(attempts, 1);
  assert.equal(track.loop, true);
  assert.equal(track.volume, 0.2);
  await audio.unlockFromGesture();
  assert.equal(attempts, 2);
  assert.equal(track.paused, false);
});
