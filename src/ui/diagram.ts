import type { ChordShape } from '../engine/convert';
import { DADGAD_LABELS } from '../engine/tuning';

// ---- Chord diagram (SVG): strings left = low D, right = high D ----
const SVG = 'http://www.w3.org/2000/svg';
export function el(tag: string, attrs: Record<string, string | number>, text?: string) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
}

export function diagram({ label, frets }: ChordShape): HTMLElement {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const lo = fretted.length ? Math.min(...fretted) : 1;
  const hi = fretted.length ? Math.max(...fretted) : 1;
  const start = hi <= 4 ? 1 : lo; // first fret shown
  const rows = 4, gap = 16, top = 30, left = 18;
  const w = left * 2 + gap * 5, h = top + gap * rows + 22;
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, fill: 'currentColor', stroke: 'currentColor' });

  for (let s = 0; s < 6; s++) svg.append(el('line', { x1: left + s * gap, y1: top, x2: left + s * gap, y2: top + rows * gap, 'stroke-width': 1 }));
  for (let r = 0; r <= rows; r++) svg.append(el('line', { x1: left, y1: top + r * gap, x2: left + 5 * gap, y2: top + r * gap, 'stroke-width': r === 0 && start === 1 ? 3 : 1 }));
  if (start > 1) svg.append(el('text', { x: 2, y: top + gap * 0.7, 'font-size': 10, stroke: 'none' }, `${start}`));

  frets.forEach((f, s) => {
    const x = left + s * gap;
    if (f === null) svg.append(el('text', { x, y: top - 8, 'font-size': 11, 'text-anchor': 'middle', stroke: 'none' }, '×'));
    else if (f === 0) svg.append(el('circle', { cx: x, cy: top - 12, r: 4, fill: 'none', 'stroke-width': 1.2 }));
    else if (f - start < rows) svg.append(el('circle', { cx: x, cy: top + (f - start + 0.5) * gap, r: 5.5, stroke: 'none' }));
    // Frets outside the 4-fret window (a high note over open strings) are labelled instead.
    else svg.append(el('text', { x, y: top + rows * gap + 12, 'font-size': 9, 'text-anchor': 'middle', stroke: 'none' }, `${f}`));
    svg.append(el('text', { x, y: h - 2, 'font-size': 9, 'text-anchor': 'middle', stroke: 'none', opacity: 0.6 }, DADGAD_LABELS[s]));
  });

  const wrap = document.createElement('div');
  wrap.className = 'diagram';
  wrap.append(svg, Object.assign(document.createElement('div'), { textContent: label }));
  return wrap;
}
