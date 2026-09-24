export function createMusicPlayer({ random = Math.random } = {}) {
  let tracks = [], current = null, previous = -1, unlocked = false, paused = false;
  let volume = .20, endingAt = null, active = false, envelope = 1;
  function apply() { if (current) current.volume = Math.max(0, Math.min(1, volume * envelope)); }
  function resume() {
    if (current && active && unlocked && !paused && current.paused && !current.ended) void current.play().catch(() => {});
  }
  function stop() { current?.pause(); active = false; endingAt = null; }
  return {
    setTracks(value) { stop(); tracks = value; previous = -1; current = null; },
    start({ loop = false } = {}) {
      stop(); if (!tracks.length) return;
      const choices = tracks.map((_, i) => i).filter(i => tracks.length === 1 || i !== previous);
      previous = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
      current = tracks[previous]; current.currentTime = 0; current.loop = loop;
      active = true; envelope = 1; apply(); resume();
    },
    unlock() { unlocked = true; resume(); },
    setPaused(value) {
      const next = Boolean(value); if (paused === next) return;
      paused = next; if (paused) current?.pause(); else resume();
    },
    setVolume(value) { volume = value; apply(); },
    tick(now, terminal) {
      if (!active || !current || !terminal) return;
      endingAt ??= now;
      envelope = Math.max(0, 1 - (now - endingAt) / 500); apply();
      if (!envelope) stop();
    },
    stop,
  };
}
