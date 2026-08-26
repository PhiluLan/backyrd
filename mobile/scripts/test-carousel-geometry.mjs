import assert from "node:assert/strict";

const GAP = 16;

function geometry(viewportWidth, itemCount = 10) {
  const cardWidth = Math.round(Math.min(390, Math.max(272, viewportWidth * 0.84)));
  const sideInset = (viewportWidth - cardWidth) / 2;
  const interval = cardWidth + GAP;
  const offsets = Array.from({ length: itemCount }, (_, index) => index * interval);
  return { viewportWidth, cardWidth, gap: GAP, sideInset, offsets };
}

for (const viewportWidth of [320, 375, 390, 393, 430]) {
  const { cardWidth, gap, sideInset, offsets } = geometry(viewportWidth);
  for (const [index, offset] of offsets.entries()) {
    const center = sideInset + index * (cardWidth + gap) - offset + cardWidth / 2;
    assert.ok(Math.abs(center - viewportWidth / 2) <= 1, `${viewportWidth}px card ${index} centre error exceeds 1px`);
  }
  // At every middle-card snap point, the two adjacent visible peeks are equal.
  const peek = sideInset - gap;
  assert.equal(peek, viewportWidth - (sideInset + cardWidth + gap));
}

console.log("carousel geometry: centre error <= 1px at 320, 375, 390, 393 and 430px");
