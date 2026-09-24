import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rule = selector => css.match(new RegExp(`\\${selector}\\{([^}]+)\\}`))?.[1] ?? '';

test('result plaque is centered over the lower frame rail', () => {
  const bottom = Number(rule('.result').match(/bottom:([\d.]+)%/)?.[1]);
  assert.ok(bottom >= 3 && bottom <= 5, `result bottom ${bottom}% should align with the lower rail`);
});

test('plaque and information headings sit slightly above the frame center', () => {
  assert.match(css, /\.result > \*\{transform:translateY\(-4px\)\}/);
  assert.match(rule('.haul-info-head h2'), /transform:translateY\(-4px\)/);
});

test('sound toggle keeps its ornate asset without a cyan focus rectangle', () => {
  const soundRule = rule('.sound');
  const artRule = rule('.sound::before');
  assert.match(soundRule, /width:56px;height:44px/);
  assert.match(artRule, /width:56px;height:26px/);
  assert.match(artRule, /sound-buttons\.png/);
  assert.match(rule('.sound.on::before'), /background-position:5% 83%/);
  assert.match(rule('.sound:focus-visible'), /outline:none/);
  assert.match(rule('.sound:focus-visible::before'), /filter:brightness\(1\.25\)/);
  assert.match(css, /\.sound\{width:50px;height:44px\}/);
  const data = readFileSync(new URL('../public/assets/ui/sound-buttons.png', import.meta.url));
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
});
