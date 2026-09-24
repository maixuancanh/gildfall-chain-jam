import './style.css';
import { formatUnits, parseUnits } from 'viem';
import { ROUTES, getPaytable, MAX_WAGER } from './math.js';
import { createAdapter } from './adapter.js';
import { createScene } from './scene.js';
import { createAudioSystem } from './audio.js';

const routeNames = ['Sheltered', 'Monster', 'Rift'];
const depthNames = ['Shallow', 'Deep', 'Abyss'];
document.querySelector('#app').innerHTML = `
  <div class="entry-screen" id="entry-screen" role="dialog" aria-modal="true" aria-label="Gildfall loading screen">
    <div class="entry-logo-frame">
      <img class="entry-logo" src="/assets/ui/gildfall-logo.png" alt="Gildfall">
    </div>
    <div class="entry-action">
      <div class="entry-loading" id="entry-loading" role="progressbar" aria-label="Loading game" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="entry-copy" id="entry-copy" aria-live="polite">LOADING 0%</span><span class="entry-track" aria-hidden="true"><span class="entry-fill" id="entry-fill"></span></span></div>
      <button class="entry-play" id="entry-play" type="button" aria-label="Enter Gildfall" hidden>ENTER</button>
    </div>
  </div>
  <main class="layout" inert>
    <section class="scene-wrap" aria-label="Treasure descent">
      <canvas id="scene" aria-label="Tap a chest to aim the elevator"></canvas>
      <button class="sound" id="sound" aria-label="Enable sound" aria-pressed="false"></button>
      <section class="result" id="result" aria-live="polite"></section>
      <div class="scene-caption" id="caption" aria-live="polite">Tap a chest to aim · Cast to descend</div>
    </section>
    <section class="panel" aria-label="Game controls">
      <h1 class="panel-title"><img src="/assets/ui/gildfall-logo.png" alt="Gildfall"></h1>
      <span class="sr-only" id="mode">PRACTICE</span>
      <div class="panel-body">
        <div class="balance"><span id="balance-label">BALANCE</span><strong id="balance">—</strong></div>
        <div class="section-label"><span>ROUTE</span><span id="top-prize">UP TO 6×</span></div>
        <div class="routes">${ROUTES.map((r, i) => `<button class="route ${i === 0 ? 'active' : ''}" data-route="${i}" aria-label="${r.name}" aria-pressed="${i === 0}">${routeNames[i]}</button>`).join('')}</div>
        <div class="section-label"><span>DEPTH</span></div>
        <div class="depths">${[1, 2, 3].map(d => `<button class="${d === 1 ? 'active' : ''}" data-depth="${d}" aria-pressed="${d === 1}">${depthNames[d - 1]}</button>`).join('')}</div>
        <label class="section-label" for="wager">WAGER <span id="unit">USDC</span></label>
        <div class="wager-control"><button id="wager-minus" type="button" aria-label="Decrease wager">−</button><input id="wager" inputmode="decimal" value="10"><button id="wager-plus" type="button" aria-label="Increase wager">+</button></div>
        <div class="status" id="status" role="status" aria-live="polite"></div>
      </div>
      <button class="cast" id="cast">CAST</button>
    </section>
  </main>
  <section class="below" inert>
    <section class="haul-info" aria-label="Paytable and recent hauls"><div class="haul-info-head"><h2>PAYTABLE</h2><h2>RECENT HAULS</h2></div><div class="haul-info-body"><div class="haul-column"><table><thead><tr><th>Result</th><th>Chance</th><th>Return</th></tr></thead><tbody id="paytable"></tbody></table><p>96% theoretical RTP before rounding. The return includes your stake; 0.5× is a loss. Your route and depth lock before the random draw.</p></div><div class="haul-column"><div class="history" id="history">No hauls yet.</div><div class="tools"><button id="recover" hidden>Recover pending session</button></div></div></div></section>
  </section>`;

const $ = selector => document.querySelector(selector);
document.body.classList.add('entry-open');
const entryAssets = ['ui/loading-banner.png', 'ui/loading-banner-mobile.png', 'ui/loading-logo-frame.png', 'ui/loading-crest.png', 'ui/gildfall-logo.png'];
let loadedEntryAssets = 0;
const entryStartedAt = performance.now();
const minimumLoadingMs = 900;
let entryRevealTimer = null;
function updateEntryProgress() {
  const control = $('#entry-play');
  if (!control) return;
  const loading = $('#entry-loading');
  const progress = Math.round((loadedEntryAssets + Number(Boolean(state?.ready))) / (entryAssets.length + 1) * 100);
  $('#entry-fill').style.transform = `scaleX(${progress / 100})`;
  $('#entry-copy').textContent = `LOADING ${progress}%`;
  loading.setAttribute('aria-valuenow', String(progress));
  const readyToEnter = progress === 100 && performance.now() - entryStartedAt >= minimumLoadingMs;
  loading.hidden = readyToEnter;
  control.hidden = !readyToEnter;
  if (progress === 100 && !readyToEnter && entryRevealTimer === null) {
    entryRevealTimer = setTimeout(() => { entryRevealTimer = null; updateEntryProgress(); }, minimumLoadingMs - (performance.now() - entryStartedAt));
  }
}
entryAssets.forEach(path => {
  const asset = new Image();
  asset.onload = asset.onerror = () => { loadedEntryAssets++; updateEntryProgress(); };
  asset.src = `${import.meta.env.BASE_URL}assets/${path}`;
});
const scene = createScene($('#scene'));
let route = 0, depth = 1, targetX = null, state, working = false, animating = null, displayedRoundId = null;
const playedRoundIds = new Set();
const amount = n => n === undefined ? '—' : formatUnits(BigInt(n), state?.decimals ?? 2);
const audio = createAudioSystem();
audio.setSounds(new Map([['bgm', new Audio(`${import.meta.env.BASE_URL}assets/audio/bgm.mp3`)], ['treasure-slash', new Audio(`${import.meta.env.BASE_URL}assets/audio/treasure-slash.mp3`)]]));
audio.startMenuMusic();
if (document.readyState === 'complete') audio.attemptAutoplayMusic();
else window.addEventListener('load', () => audio.attemptAutoplayMusic(), { once: true });
function updateSoundButton() {
  const enabled = !audio.muted;
  $('#sound').classList.toggle('on', enabled);
  $('#sound').setAttribute('aria-pressed', String(enabled));
  $('#sound').setAttribute('aria-label', enabled ? 'Mute sound' : 'Enable sound');
}
updateSoundButton();
function soundEvent(id, kind) { audio.handleEvents([{ id: `${id}:${kind}`, kind }]); }
document.addEventListener('pointerdown', event => { if (!$('#entry-screen') && !event.target.closest('#sound')) void audio.unlockFromGesture().catch(() => {}); }, { capture: true });
document.addEventListener('keydown', event => { if (!$('#entry-screen') && !event.target.closest?.('#sound')) void audio.unlockFromGesture().catch(() => {}); }, { capture: true });
document.addEventListener('visibilitychange', () => audio.setPaused(document.hidden));
function error(e) { $('#status').textContent = e.message || String(e); }
function selection() {
  document.querySelectorAll('[data-route]').forEach(button => {
    const active = Number(button.dataset.route) === route;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-depth]').forEach(button => {
    const active = Number(button.dataset.depth) === depth;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#top-prize').textContent = `UP TO ${3 + 3 * depth}×`;
  $('#paytable').innerHTML = getPaytable(route, depth).map(row => `<tr><td>${row.name}</td><td>${row.weight / 100}%</td><td>${row.multiplierBps / 10000}×</td></tr>`).join('');
  scene.choose(route, depth, targetX);
}
function render(next) {
  state = next;
  updateEntryProgress();
  if (next.current?.id && !next.current.revealed) playedRoundIds.add(next.current.id);
  if (next.current?.route !== undefined && next.current?.depth !== undefined && next.current.id !== displayedRoundId) {
    displayedRoundId = next.current.id; route = next.current.route; depth = next.current.depth;
    if (next.mode === 'host' && !next.current.revealed) $('#wager').value = formatUnits(BigInt(next.current.wager), next.decimals);
    selection();
  }
  if (!next.current) displayedRoundId = null;
  const pending = !!next.current && !next.current.revealed, locked = working || pending;
  $('#mode').textContent = next.mode === 'demo' ? 'PRACTICE' : 'CHAIN HOST';
  $('#balance-label').textContent = next.mode === 'demo' ? 'BALANCE' : 'VAULT BALANCE';
  $('#balance').textContent = `${amount(next.balance)} ${next.symbol}`;
  $('#unit').textContent = next.symbol;
  $('#status').textContent = next.ready ? '' : next.message;
  $('#recover').hidden = next.mode !== 'host' || !pending || !!next.current?.outcome;
  document.querySelectorAll('[data-route],[data-depth],#wager,#wager-minus,#wager-plus,#cast').forEach(control => { control.disabled = locked || !next.ready; });
  $('#cast').textContent = 'CAST';
  const recentHauls = next.history.filter(record => playedRoundIds.has(record.id));
  $('#history').replaceChildren(...recentHauls.map(record => {
    const item = document.createElement('span');
    item.textContent = `${record.outcome.multiplierBps / 10000}× · ${amount(record.payout)} returned`;
    return item;
  }));
  if (!recentHauls.length) $('#history').textContent = 'No hauls yet.';

  if (next.current?.outcome && !next.current.revealed && animating !== next.current.id) {
    const current = next.current;
    animating = current.id;
    $('#caption').textContent = 'Descending…';
    const ms = scene.play(current);
    setTimeout(() => { if (animating === current.id) soundEvent(current.id, 'elevator-arrive'); }, ms * .28);
    setTimeout(() => { if (animating === current.id) { $('#caption').textContent = current.outcome.shield ? 'Shielded!' : 'Opening…'; soundEvent(current.id, 'treasure-open'); } }, ms * .5);
    setTimeout(() => {
      if (animating !== current.id) return;
      if (current.outcome.cut) soundEvent(current.id, 'slash');
      if (current.outcome.shield) soundEvent(current.id, 'boom-attack');
      else if (current.outcome.cut) soundEvent(current.id, 'cable-cut');
    }, ms * .72);
    setTimeout(async () => {
      try { await adapter.finish(current.id); soundEvent(current.id, current.outcome.multiplierBps > 10000 ? 'victory' : 'haul-resolve'); }
      catch (e) { animating = null; error(e); $('#caption').textContent = 'Settlement pending'; }
    }, ms);
  }
  const result = $('#result');
  result.replaceChildren();
  if (working || pending) {
    const title = document.createElement('strong');
    title.textContent = 'PROCESSING';
    result.append(title);
  } else if (next.current?.revealed && next.current.outcome && playedRoundIds.has(next.current.id)) {
    const current = next.current, net = BigInt(current.payout) - BigInt(current.wager);
    $('#caption').textContent = current.outcome.label;
    const title = document.createElement('strong');
    title.textContent = net > 0n ? 'TREASURE FOUND' : net === 0n ? 'STAKE RETURNED' : 'HAUL LOST';
    result.append(title);
    const detail = document.createElement('span');
    detail.textContent = `${amount(current.payout)} ${next.symbol} · ${current.outcome.multiplierBps / 10000}×`;
    result.append(detail);
  } else {
    const title = document.createElement('strong');
    title.textContent = 'READY TO CAST';
    result.append(title);
  }
}
const adapter = createAdapter(render);
document.querySelectorAll('[data-route]').forEach(button => button.onclick = () => { audio.playUi(); route = Number(button.dataset.route); targetX = null; selection(); });
document.querySelectorAll('[data-depth]').forEach(button => button.onclick = () => { audio.playUi(); depth = Number(button.dataset.depth); selection(); });
$('#scene').addEventListener('pointerdown', event => {
  if (!state?.ready || working || (state.current && !state.current.revealed)) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width * 600;
  const y = (event.clientY - bounds.top) / bounds.height * 650;
  targetX = Math.max(110, Math.min(490, x));
  audio.playUi();
  route = Math.min(2, Math.floor(x / 200));
  depth = y < 244 ? 1 : y < 381 ? 2 : 3;
  selection();
  $('#caption').textContent = `${depthNames[depth - 1]} chest selected`;
});
$('#wager').oninput = () => { $('#status').textContent = ''; };
function stepWager(direction) {
  if (!state?.ready || working || (state.current && !state.current.revealed)) return;
  audio.playUi();
  const unit = 10n ** BigInt(state.decimals);
  const cap = [MAX_WAGER, state.balance === undefined ? MAX_WAGER : BigInt(state.balance), adapter.maxWager(route, depth) ?? MAX_WAGER].reduce((a, b) => a < b ? a : b);
  if (cap < unit) return;
  let current;
  try { current = parseUnits($('#wager').value.trim(), state.decimals); }
  catch { current = unit; }
  if (direction > 0 && current >= cap) {
    $('#status').textContent = `Maximum wager: ${formatUnits(cap, state.decimals)} ${state.symbol}.`;
    return;
  }
  const next = current + BigInt(direction) * unit;
  $('#wager').value = formatUnits(next < unit ? unit : next > cap ? cap : next, state.decimals);
  $('#wager').dispatchEvent(new Event('input', { bubbles: true }));
}
$('#wager-minus').onclick = () => stepWager(-1);
$('#wager-plus').onclick = () => stepWager(1);

async function commit() {
  if (working) return;
  audio.playUi();
  working = true; render(state);
  try {
    const text = $('#wager').value.trim();
    if (!/^\d+(\.\d+)?$/.test(text) || (text.split('.')[1] || '').length > state.decimals) throw new Error('Enter a valid wager.');
    await adapter.open({ route, depth, wager: parseUnits(text, state.decimals).toString() });
  } catch (e) { error(e); }
  finally { working = false; if (state) { const message = $('#status').textContent; render(state); $('#status').textContent = message; } }
}
let holdTimer, holdStep, held = false, suppressClick = false;
function clearHold() { clearTimeout(holdTimer); clearInterval(holdStep); holdTimer = null; holdStep = null; }
$('#cast').addEventListener('pointerdown', e => {
  if (e.button !== 0 || $('#cast').disabled) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  held = false;
  holdTimer = setTimeout(() => {
    held = true; depth = Math.min(3, depth + 1); selection();
    $('#caption').textContent = `Lowering to ${depthNames[depth - 1]}…`;
    holdStep = setInterval(() => { if (depth < 3) { depth++; selection(); $('#caption').textContent = `Lowering to ${depthNames[depth - 1]}…`; } }, 650);
  }, 450);
});
$('#cast').addEventListener('pointerup', () => {
  clearHold();
  if (held) { held = false; suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); void commit(); }
});
$('#cast').addEventListener('pointercancel', () => { clearHold(); held = false; });
$('#cast').onclick = () => { if (suppressClick) { suppressClick = false; return; } void commit(); };
$('#recover').onclick = () => adapter.cancel().catch(error);
$('#sound').onclick = () => {
  audio.setMuted(!audio.muted);
  updateSoundButton();
  if (!audio.muted) audio.playUi();
};
$('#entry-play').onclick = () => {
  if (!state?.ready) return;
  void audio.unlockFromGesture().catch(() => {});
  const entryScreen = $('#entry-screen');
  entryScreen.remove();
  document.body.classList.remove('entry-open');
  $('.layout').removeAttribute('inert');
  $('.below').removeAttribute('inert');
};
selection(); adapter.init();
