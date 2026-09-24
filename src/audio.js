import { createMusicPlayer } from './music.js';
const MUTE_KEY = 'gildfall.muted.v1';
const EVENT_TONES = Object.freeze({
  capture: 420,
  'bank-common': 520,
  'bank-rare': 660,
  'bank-epic': 780,
  'bank-legendary': 920,
  'rage-telegraph': 180,
  'cable-cut': 110,
  victory: 1046,
  'bank-mythic': 1175, 'boom-attack': 95, 'treasure-open': 784,
  'mystery-reveal': 880, 'haul-resolve': 660, slash: 240,
  'time-up': 196, 'ui-click': 740, 'stun-end': 330,
  'elevator-arrive': 180, countdown: 880, miss: 220, escape: 980,
  'loot-refresh': 440,
  'quake-warning': 65, 'quake-rumble': 45, 'rock-impact': 130,
});

function readMuted(storage) {
  try { return storage?.getItem?.(MUTE_KEY) === 'true'; } catch { return false; }
}

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function createAudioSystem({ AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext, storage = browserStorage() } = {}) {
  let context = null;
  let master = null;
  let effects = null;
  let music = null;
  let muted = readMuted(storage);
  let locked = true;
  let paused = false;
  let uiSequence = 0;
  const voices = new Set();
  const quakeVoices = new Set();
  let rockNoiseBuffer = null;
  const stoneBuffers = new Map(), activeStoneSamples = new Map();
  let stoneDecode = null;
  let stoneQuietUntil = 0;
  const media = new Set();
  const played = new Set();
  let sounds = new Map();
  const gains = { master: 1, effects: 1, music: 0.20 };
  const backgroundMusic = createMusicPlayer();

  function applyGains() {
    backgroundMusic.setVolume(muted ? 0 : gains.master * gains.music);
    if (!master) return;
    master.gain.value = muted ? 0 : gains.master;
    effects.gain.value = gains.effects;
    music.gain.value = gains.music;
    for (const sound of media) sound.volume = muted || paused ? 0 : gains.master * gains.effects;
  }

  function stopAll() {
    for (const sound of media) { sound.pause?.(); sound.currentTime = 0; }
    media.clear();
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices.clear();
    quakeVoices.clear();
    activeStoneSamples.clear();
    stoneQuietUntil = context?.currentTime ?? 0;
  }

  function tone(frequency, { delay = 0, duration = .14, end = frequency, volume = .09, type = 'sine', environment = false } = {}) {
    if (voices.size >= 24) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = context.currentTime + delay;
    oscillator.type = type;
    if (oscillator.frequency) {
      oscillator.frequency.value = frequency;
      oscillator.frequency.setValueAtTime?.(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime?.(Math.max(20, end), at + duration);
    }
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime?.(.001, at + duration);
    oscillator.connect(gain); gain.connect(effects);
    voices.add(oscillator);
    if (environment) quakeVoices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); quakeVoices.delete(oscillator); oscillator.disconnect?.(); gain.disconnect?.(); };
    oscillator.start(at); oscillator.stop(at + duration);
  }

  function rockNoise({ frequency = 900, duration = .2, volume = .18, delay = 0, type = 'bandpass' } = {}) {
    if (voices.size >= 24 || !context.createBufferSource || !context.createBuffer || !context.createBiquadFilter) return;
    if (!rockNoiseBuffer) {
      rockNoiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * .7), context.sampleRate);
      const samples = rockNoiseBuffer.getChannelData(0);
      let seed = 0x71a38b;
      for (let i = 0; i < samples.length; i++) {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        samples[i] = (seed >>> 0) / 2147483648 - 1;
      }
    }
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = rockNoiseBuffer;
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = .8;
    const at = context.currentTime + delay;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime?.(.001, at + duration);
    source.connect(filter); filter.connect(gain); gain.connect(effects);
    voices.add(source); quakeVoices.add(source);
    source.onended = () => { voices.delete(source); quakeVoices.delete(source); source.disconnect?.(); filter.disconnect?.(); gain.disconnect?.(); };
    source.start(at); source.stop(at + duration);
  }

  async function unlockFromGesture() {
    if (!AudioContextCtor) return false;
    if (!context) {
      context = new AudioContextCtor();
      master = context.createGain();
      effects = context.createGain();
      music = context.createGain();
      effects.connect(master);
      music.connect(master);
      master.connect(context.destination ?? master);
      applyGains();
    }
    if (context.state === 'suspended') await context.resume();
    await prepareStoneSamples();
    locked = false;
    backgroundMusic.unlock();
    return true;
  }

  async function prepareStoneSamples() {
    if (!context?.decodeAudioData) return;
    if (!stoneDecode) stoneDecode = Promise.all(['rock-break','boulder-drop','boulder-move'].map(async key => {
      const bytes = sounds.get(key)?.encodedBytes;
      if (bytes) {
        try { stoneBuffers.set(key, await context.decodeAudioData(bytes.slice(0))); } catch { /* retain non-tonal fallback if decoding is unsupported */ }
      }
    }));
    await stoneDecode;
  }

  function playStoneSample(event) {
    const key = event.kind === 'quake-warning' ? 'rock-break' : event.kind === 'quake-rumble' ? 'boulder-move' : 'boulder-drop';
    const buffer = stoneBuffers.get(key);
    if (!buffer) return false;
    // Let recorded decay/gravel finish instead of chopping it into regular pulses.
    if (activeStoneSamples.size || context.currentTime < stoneQuietUntil || voices.size >= 24) return true;
    const source = context.createBufferSource(), gain = context.createGain();
    let variation = 0; for (const ch of event.id) variation = (variation * 31 + ch.charCodeAt(0)) >>> 0;
    const rate = .9 + (variation % 17) / 100;
    // All stone layers share one quiet interval; skipped cues are never queued.
    stoneQuietUntil = context.currentTime + buffer.duration / rate + .55 + (variation % 701) / 1000;
    source.buffer = buffer; source.playbackRate.value = rate;
    const volume = event.kind === 'quake-warning' ? .3 * (event.intensity ?? 1) : event.kind === 'quake-rumble' ? .42 : .52;
    gain.gain.setValueAtTime(volume, context.currentTime);
    source.connect(gain); gain.connect(effects);
    voices.add(source); quakeVoices.add(source); activeStoneSamples.set(key,source);
    source.onended = () => {
      voices.delete(source); quakeVoices.delete(source);
      if (activeStoneSamples.get(key) === source) activeStoneSamples.delete(key);
      source.disconnect?.(); gain.disconnect?.();
    };
    source.start(context.currentTime); source.stop(context.currentTime + buffer.duration / rate);
    return true;
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (muted) stopAll();
    try { storage?.setItem?.(MUTE_KEY, String(muted)); } catch { /* persistence is best effort */ }
    applyGains();
    return muted;
  }

  function setGains(values = {}) {
    for (const key of ['master', 'effects', 'music']) {
      if (Number.isFinite(values[key])) gains[key] = Math.max(0, Math.min(1, values[key]));
    }
    applyGains();
    return { ...gains };
  }

  function handleEvents(events = []) {
    if (locked || muted || paused || !context) return 0;
    let count = 0;
    for (const event of events) {
      const frequency = EVENT_TONES[event?.kind];
      if (!event?.id || !frequency || played.has(event.id)) continue;
      played.add(event.id);
      if (played.size > 512) played.delete(played.values().next().value);
      if (event.kind === 'victory') {
        [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
          tone(note, { delay: index * .12, duration: .35, volume: .12 });
        });
        count += 1;
        continue;
      }
      const soundKey = event.kind === 'slash' ? 'treasure-slash' : null;
      const sound = sounds.get(soundKey);
      if (sound?.play) {
        sound.currentTime = 0; sound.volume = gains.master * gains.effects;
        media.add(sound); sound.onended = () => media.delete(sound);
        void sound.play().catch(() => { media.delete(sound); if (!muted && !paused) tone(frequency); });
        count += 1; continue;
      }
      if (event.kind.startsWith('quake-')) {
        if (playStoneSample(event)) { count += 1; continue; }
        const warning = event.kind === 'quake-warning';
        const intensity = Math.max(0, Math.min(1, event.intensity ?? 1));
        rockNoise({ frequency: warning ? 1200 : 260, duration: warning ? .18 : .3, volume: warning ? .2 * intensity : .3, type: warning ? 'bandpass' : 'lowpass' });
      } else if (event.kind === 'rock-impact') {
        if (playStoneSample(event)) { count += 1; continue; }
        rockNoise({ frequency: 850, duration: .2, volume: .28 });
        rockNoise({ frequency: 2600, duration: .09, volume: .12, delay: .06 });
      } else if (event.kind === 'boom-attack') {
        for (const voice of quakeVoices) { try { voice.stop(); } catch {} voices.delete(voice); }
        quakeVoices.clear();
        activeStoneSamples.clear();
        tone(160, { end: 28, duration: .65, volume: .18, type: 'sawtooth' });
        tone(70, { end: 24, duration: .8, volume: .14, type: 'triangle' });
      } else if (['treasure-open','bank-mythic','mystery-reveal','haul-resolve'].includes(event.kind)) {
        [1,1.25,1.5].forEach((ratio,index)=>tone(frequency*ratio,{delay:index*.07,duration:.24}));
      } else if (['time-up','cable-cut'].includes(event.kind)) {
        tone(frequency,{end:55,duration:.4,type:'triangle'});
      } else {
        tone(frequency, { end: event.kind === 'slash' ? 70 : frequency * 1.12, duration: event.kind === 'countdown' ? .07 : .14 });
      }
      count += 1;
    }
    return count;
  }

  return {
    setSounds(value) { sounds = value instanceof Map ? value : new Map(); backgroundMusic.setTracks([sounds.get('bgm')].filter(Boolean)); applyGains(); stoneDecode = null; stoneBuffers.clear(); if (context) void prepareStoneSamples(); },
    startMusic() { backgroundMusic.start(); },
    startMenuMusic() { backgroundMusic.start({ loop: true }); },
    attemptAutoplayMusic() { if (!muted) backgroundMusic.unlock(); },
    updateMusic(now, terminal) { backgroundMusic.tick(now, terminal); },
    reset() { stopAll(); backgroundMusic.stop(); backgroundMusic.setPaused(false); played.clear(); paused = false; },
    setPaused(value) { const next = Boolean(value); if (next && !paused) stopAll(); paused = next; backgroundMusic.setPaused(next); },
    playUi() { void unlockFromGesture().then(() => handleEvents([{ id: `ui:${++uiSequence}`, kind: 'ui-click' }])).catch(() => {}); },
    unlockFromGesture,
    handleEvents,
    setMuted,
    setGains,
    get context() { return context; },
    get locked() { return locked; },
    get muted() { return muted; },
    get gains() { return { ...gains }; },
    get playedEventCount() { return played.size; },
  };
}
