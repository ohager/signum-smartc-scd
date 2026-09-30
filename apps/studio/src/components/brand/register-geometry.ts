/**
 * The Register mark: an S spelled by eleven cells of a 3×5 memory map, the four
 * unused cells drawn as empty outlines. Pure geometry, shared by the React mark,
 * the favicon and the splash in index.html, so all three are the same drawing.
 */

export type CellKind = "ghost" | "lit" | "end";

export interface Cell {
  kind: CellKind;
  x: number;
  y: number;
  size: number;
  /** Position along the pen stroke, for the build animation. Unset for ghosts. */
  order?: number;
}

/** Row/column of the S, in the order a pen would draw it: top-right to bottom-left. */
const PEN: readonly [number, number][] = [
  [0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2], [4, 2], [4, 1], [4, 0],
];
const EMPTY: readonly [number, number][] = [[1, 1], [1, 2], [3, 0], [3, 1]];

const penCells = (x0: number, y0: number, step: number, size: number): Cell[] =>
  PEN.map(([r, c], i) => ({
    kind: i === 0 || i === PEN.length - 1 ? "end" : "lit",
    x: x0 + c * step,
    y: y0 + r * step,
    size,
    order: i,
  }));

/** The full mark on a 64-unit square: 9-unit cells, 2.5-unit gaps. */
export function largeCells(): Cell[] {
  const size = 9, step = 11.5, x0 = 32 - (3 * size + 2 * 2.5) / 2, y0 = 32 - (5 * size + 4 * 2.5) / 2;
  const ghosts: Cell[] = EMPTY.map(([r, c]) => ({ kind: "ghost", x: x0 + c * step + 0.5, y: y0 + r * step + 0.5, size: size - 1 }));
  return [...ghosts, ...penCells(x0, y0, step, size)];
}

/** The small mark on a `box`-pixel square: whole-pixel cells, no gaps, no ghosts. */
export function pixelCells(box: number): Cell[] {
  // Five cells must fit the height: 16px → 3px cells (9×15), 12px → 2px (6×10).
  const px = Math.max(1, Math.floor(box / 5));
  return penCells(Math.floor((box - 3 * px) / 2), Math.floor((box - 5 * px) / 2), px, px);
}

/** Below this the gaps and outlines smear, so the pixel version takes over. */
export const PIXEL_THRESHOLD = 16;

/** favicon.svg — a favicon cannot read the page's climate, so it wears Nexus. */
export function faviconSvg(): string {
  const rects = pixelCells(16)
    .map((c) => `  <rect x="${c.x}" y="${c.y}" width="${c.size}" height="${c.size}" fill="${c.kind === "end" ? "#00aaff" : "#0066ff"}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">\n${rects}\n</svg>\n`;
}
