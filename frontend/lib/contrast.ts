/**
 * Which ink reads on a given fill.
 *
 * Used where a colour arrives as data (brand swatches, persona accents) and cannot be
 * fixed at build time. Implemented against the WCAG relative-luminance formula so the
 * answer is the same one an accessibility audit will give.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const IVORY = "#FBF7EE";
const INK = "#14192E";

/** The cream or the ink, whichever scores higher on this fill. */
export function readableOn(hex: string): string {
  return contrastRatio(IVORY, hex) >= contrastRatio(INK, hex) ? IVORY : INK;
}
