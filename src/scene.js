// The haul is decided before this scene starts. These sprites only reveal it.
import { elevatorLayout } from './scene-geometry.js';
const file = name => `${import.meta.env.BASE_URL}assets/${name}`;
const load = name => { const image = new Image(); image.src = file(name); return image; };
const ready = image => image.complete && image.naturalWidth > 0;
const ease = t => 1 - (1 - Math.max(0, Math.min(1, t))) ** 3;

export function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const width = 600, height = 650;
  canvas.width = width; canvas.height = height;
  ctx.imageSmoothingEnabled = false;
  const background = load('cavern.png');
  const platform = load('elevator/platform.png');
  const ropeTile = load('elevator/rope-tile.png');
  const angler = load('angler-sheet.png');
  const chestSheet = load('chest-sheet.png');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1900 : 7200;
  let route = 0, depth = 1, targetX = null, round = null, start = 0, stopped = false;
  const paths = [180, 300, 420];
  const chestX = [130, 215, 300, 385, 470];
  const floorY = tier => 175 + (tier - 1) * 137;

  function sprite(sheet, columns, rows, frame, x, y, w, h) {
    if (!ready(sheet)) return;
    const cw = sheet.naturalWidth / columns, ch = sheet.naturalHeight / rows;
    const sx = frame % columns * cw, sy = Math.floor(frame / columns) * ch;
    ctx.drawImage(sheet, sx, sy, cw, ch, Math.round(x), Math.round(y), w, h);
  }

  function chest(x, y, frame, now, seed) {
    const bob = Math.sin(now * .0034 + seed * 1.3) * 4.5;
    sprite(chestSheet, 4, 2, frame, x - 37, y + bob - 31, 74, 62);
  }

  function drawRope(x, fromY, toY) {
    if (toY <= fromY) return;
    ctx.save();
    for (const [color, lineWidth] of [['#0b0e12', 5.9], ['#7f522f', 4.3], ['#f0c66a', 2.7]]) {
      ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
      ctx.beginPath(); ctx.moveTo(x, fromY); ctx.lineTo(x, toY); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 246, 201, .85)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(x - .5, fromY); ctx.lineTo(x - .5, toY); ctx.stroke();
    if (ready(ropeTile)) {
      const pattern = ctx.createPattern(ropeTile, 'repeat-y');
      ctx.translate(x, fromY); ctx.scale(.332, 1);
      ctx.fillStyle = pattern; ctx.fillRect(-ropeTile.width / 2, 0, ropeTile.width, toY - fromY);
    }
    ctx.restore();
  }

  function draw(now) {
    if (stopped) return;
    const p = round ? Math.min(1, (now - start) / duration) : 0;
    ctx.clearRect(0, 0, width, height);
    if (ready(background)) ctx.drawImage(background, 0, 0, width, height);
    else { ctx.fillStyle = '#08272d'; ctx.fillRect(0, 0, width, height); }

    const chosenRoute = round?.route ?? route;
    const chosenDepth = round?.depth ?? depth;
    const chosenX = targetX ?? paths[chosenRoute];
    const targetY = floorY(chosenDepth) + 61;
    const openedCount = round ? Math.min(5, Math.round(Math.log2((round.outcome.openedMask >> (5 * (round.depth - 1))) + 1))) : 0;
    const hitOrder = chestX.map((x, i) => i).sort((a, b) => Math.abs(chestX[a] - chosenX) - Math.abs(chestX[b] - chosenX));
    const hitX = chestX[hitOrder[0]];
    const platformY = !round ? -68 : p < .28 ? -68 + (targetY + 68) * ease(p / .28)
      : p < .78 ? targetY : targetY - (targetY + 70) * ease((p - .78) / .22);

    for (let tier = 1; tier <= 3; tier++) {
      const y = floorY(tier);
      for (let i = 0; i < 5; i++) {
        const selected = round && tier === round.depth && hitOrder.slice(0, openedCount).includes(i);
        const opened = selected && p > .46;
        const frame = opened ? Math.min(7, 4 + Math.floor((p - .46) * 18)) : 0;
        chest(chestX[i], y, frame, now, i + tier * 7);
      }
    }

    const casting = round && p >= .34 && p < .71;
    const animFrame = casting ? 4 + Math.floor((p - .34) / .37 * 4) % 4
      : round && p >= .71 && p < .86 ? 8 + Math.floor((p - .71) / .15 * (openedCount ? 4 : 2)) % (openedCount ? 4 : 2)
      : Math.floor(now / 220) % 4;
    const layout = elevatorLayout({ x: chosenX, topY: platformY - 7, frame: animFrame });
    const { leftRing, rightRing } = layout;
    if (platformY > -55) {
      for (const ring of [leftRing, rightRing]) {
        drawRope(ring.x, 0, ring.y);
      }
    }
    if (ready(platform)) ctx.drawImage(platform, chosenX - 59, platformY - 7, 118, 52);

    // Source-frame foot bounds keep both boots on the deck during the whole animation.
    const facingLeft = hitX < chosenX - 12;
    ctx.save();
    if (facingLeft) { ctx.translate(chosenX * 2, 0); ctx.scale(-1, 1); }
    sprite(angler, 4, 3, animFrame, chosenX - 47, layout.actorTopY, 94, 116);
    ctx.restore();

    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  return {
    choose(nextRoute, nextDepth, nextX = null) { route = nextRoute; depth = nextDepth; targetX = nextX; round = null; },
    play(value) { round = value; start = performance.now(); return duration; },
    destroy() { stopped = true; },
  };
}
