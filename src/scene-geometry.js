const PLATFORM_SOURCE = Object.freeze({ width: 1909, height: 824, anchorX: 954.5, leftRingX: 166, rightRingX: 1742, ringY: 265, deckY: 345 });
const FOOT_BOTTOM = Object.freeze([337, 337, 337, 337, 316, 318, 319, 319, 295, 295, 297, 297]);

export function elevatorLayout({ x, topY, frame, width = 118, height = 52, actorHeight = 116 }) {
  const scaleX = width / PLATFORM_SOURCE.width;
  const scaleY = height / PLATFORM_SOURCE.height;
  const ringY = topY + PLATFORM_SOURCE.ringY * scaleY;
  const footBottomPx = FOOT_BOTTOM[frame] ?? FOOT_BOTTOM[0];
  const deckY = topY + PLATFORM_SOURCE.deckY * scaleY;
  return {
    leftRing: { x: x + (PLATFORM_SOURCE.leftRingX - PLATFORM_SOURCE.anchorX) * scaleX, y: ringY },
    rightRing: { x: x + (PLATFORM_SOURCE.rightRingX - PLATFORM_SOURCE.anchorX) * scaleX, y: ringY },
    deckY,
    footBottomPx,
    actorTopY: deckY - footBottomPx / 362 * actorHeight + 5,
  };
}
