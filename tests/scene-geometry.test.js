import test from 'node:test';
import assert from 'node:assert/strict';
import { elevatorLayout } from '../src/scene-geometry.js';

test('both ropes terminate at the original platform ring centres', () => {
  const layout = elevatorLayout({ x: 300, topY: 200, frame: 0 });
  assert.ok(Math.abs(layout.leftRing.x - 251.27) < 0.1);
  assert.ok(Math.abs(layout.rightRing.x - 348.66) < 0.1);
  assert.ok(Math.abs(layout.leftRing.y - 216.72) < 0.1);
  assert.equal(layout.leftRing.y, layout.rightRing.y);
});

test('the character boots overlap the deck on every animation row', () => {
  for (const frame of [0, 3, 4, 5, 7, 8, 10, 11]) {
    const layout = elevatorLayout({ x: 300, topY: 200, frame });
    const overlap = layout.actorTopY + layout.footBottomPx / 362 * 116 - layout.deckY;
    assert.ok(overlap >= 4 && overlap <= 6, `frame ${frame}: overlap ${overlap}`);
  }
});
