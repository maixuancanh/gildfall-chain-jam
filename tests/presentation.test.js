import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('paytable and recent hauls are always shown inside one generated game frame', () => {
  assert.match(main, /<section class="haul-info"/);
  assert.equal((main.match(/<details/g) ?? []).length, 0);
  assert.match(main, /PAYTABLE/);
  assert.match(main, /RECENT HAULS/);
  assert.match(css, /haul-info-frame\.png/);
  assert.doesNotMatch(css, /info-panel\.png/);
  assert.doesNotMatch(css, /\.haul-info-body\{[^}]*background:/);
});

test('demo reset and raw outcome detail controls are absent', () => {
  assert.doesNotMatch(main, /Outcome details|Reset practice credits|id="verify"|id="reset"|id="proof"/);
  assert.match(main, /id="recover"/);
});

test('game controls use generated frames and concise copy', () => {
  assert.match(main, /gildfall-logo\.png" alt="Gildfall"/);
  assert.doesNotMatch(main, /THE DESCENT/);
  assert.match(main, /READY TO CAST/);
  assert.doesNotMatch(main, /PRACTICE BALANCE|Hold to descend · release to cast|CAST ·/);
  assert.match(main, /id="wager-minus"/);
  assert.match(main, /id="wager-plus"/);
  assert.match(css, /choice-frame\.png/);
  assert.match(css, /wager-frame\.png/);
  assert.match(css, /\.cast\{[^}]*background-size:contain/);
  assert.doesNotMatch(css, /\.route,\.depths button\{[^}]*border:2px/);
  assert.match(css, /\.wager-control button\{[^}]*display:flex;align-items:center;justify-content:center/);
  assert.match(css, /\.cast\{[^}]*bottom:16\.2%/);
});

test('route and depth choices have no diamond glyphs and share larger centered labels', () => {
  assert.doesNotMatch(main, /class="glyph"|◇|◈|◆/);
  assert.match(css, /\.route,\.depths button\{[^}]*font-size:12px/);
  assert.match(css, /\.route\{[^}]*align-items:center;justify-content:center/);
});

test('only the supplied BGM is wired and autoplay is attempted after page load', () => {
  assert.match(main, /assets\/audio\/bgm\.mp3/);
  assert.doesNotMatch(main, /bgm-pinkbean-/);
  assert.match(main, /addEventListener\('load',/);
  assert.match(main, /audio\.attemptAutoplayMusic\(\)/);
});

test('loading screen swaps a progress bar for an unfilled ENTER button in one slot', () => {
  assert.match(main, /id="entry-screen"/);
  assert.match(main, /id="entry-loading"[^>]*role="progressbar"/);
  assert.match(main, /id="entry-play"[^>]*hidden/);
  assert.match(main, /id="entry-fill"/);
  assert.match(main, /id="entry-copy"/);
  assert.match(main, /class="entry-track"/);
  assert.doesNotMatch(main, /<button[^>]*id="entry-play"[^>]*>\s*<span class="entry-fill"/);
  assert.match(main, /const readyToEnter = progress === 100 && performance\.now\(\) - entryStartedAt >= minimumLoadingMs/);
  assert.match(main, /loading\.hidden = readyToEnter/);
  assert.match(main, /control\.hidden = !readyToEnter/);
  assert.doesNotMatch(main, /class="entry-card"|class="entry-state"/);
  assert.match(main, /<main class="layout" inert>/);
  assert.match(main, /<section class="below" inert>/);
  assert.match(main, /audio\.unlockFromGesture\(\)/);
  assert.match(main, /entryScreen\.remove\(\)/);
  assert.match(css, /loading-banner\.png/);
  assert.match(css, /loading-banner-mobile\.png/);
  assert.match(css, /\.entry-logo-frame\{[^}]*loading-crest\.png/);
  assert.match(css, /\.entry-play\{[^}]*loading-logo-frame\.png/);
  assert.match(css, /\.entry-track\{[^}]*border-radius:999px/);
  assert.match(css, /\.entry-track\{[^}]*height:10px/);
  assert.match(css, /\.entry-loading\{[^}]*background:none/);
  assert.match(css, /\.entry-fill\{/);
});

test('loading logo is inset within the blue crest field', () => {
  assert.match(css, /\.entry-logo\{[^}]*left:10%;top:17%;width:80%;height:72%/);
});

test('scene has no severed elevator rope or auxiliary line from hook to chest', () => {
  assert.doesNotMatch(scene, /const severed|strikeY|quadraticCurveTo/);
  assert.match(scene, /drawRope\(ring\.x, 0, ring\.y\)/);
});
