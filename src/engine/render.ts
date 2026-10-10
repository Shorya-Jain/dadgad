import { ChordToken, TabBlock } from './parse';
import { DADGAD, DADGAD_LABELS, Frets } from './tuning';

export interface Placement {
  frets: Frets;
  revoiced: boolean;
}

const TECHNIQUE = /[^-| ]/g;

/** Where each source string's note went in the new placement (falls back to the same string). */
function stringMap(block: TabBlock, k: number, placement: Placement | undefined): Map<number, number> {
  const map = new Map<number, number>();
  const event = block.events[k];
  if (!event || !placement) return map;
  for (const n of event.notes) {
    const target = placement.frets.findIndex((f, s) => f !== null && DADGAD[s] + f === n.pitch);
    map.set(n.string, target >= 0 ? target : n.string);
  }
  return map;
}

/** Rebuild a tab block in DADGAD, keeping the source's rhythm spacing and moving techniques with their notes. */
export function renderTab(block: TabBlock, placements: Placement[]): string[] {
  const lines = DADGAD_LABELS.map((l) => `${l}|`).reverse(); // top line = string 5
  const marker: string[] = [' '.repeat(lines[0].length)];
  const prefixLen = lines[0].length;

  const writeGap = (k: number) => {
    const gap = block.gaps[k];
    const out = gap.map((g) => g.replace(TECHNIQUE, '-'));
    // A technique (h, p, /, b ...) belongs to the note before it, or the one after if there's none.
    const before = stringMap(block, k - 1, placements[k - 1]);
    const after = stringMap(block, k, placements[k]);
    gap.forEach((g, line) => {
      const src = 5 - line;
      const target = before.get(src) ?? after.get(src) ?? src;
      for (const m of g.matchAll(TECHNIQUE)) {
        const t = 5 - target;
        out[t] = out[t].slice(0, m.index!) + m[0] + out[t].slice(m.index! + 1);
      }
    });
    out.forEach((g, line) => (lines[line] += g));
    marker[0] += ' '.repeat(out[0].length);
  };

  block.events.forEach((event, k) => {
    writeGap(k);
    const p = placements[k];
    const cells = [5, 4, 3, 2, 1, 0].map((s) => (p.frets[s] === null ? '' : String(p.frets[s])));
    const width = Math.max(event.width, ...cells.map((c) => c.length));
    cells.forEach((c, line) => (lines[line] += c.padEnd(width, '-')));
    marker[0] += (p.revoiced ? '*' : ' ').padEnd(width, ' ');
  });
  writeGap(block.events.length);

  const out = lines.map((l) => l.trimEnd());
  if (placements.some((p) => p.revoiced)) out.push(marker[0].trimEnd() || ' '.repeat(prefixLen));
  return out;
}

const SUPERSCRIPT = '¹²³⁴⁵⁶⁷⁸⁹';

/** Rebuild a chord line, tagging chords that use more than one shape in this song (G¹, G²). */
export function renderChordLine(tokens: ChordToken[], labels: string[]): string {
  let out = '';
  tokens.forEach((t, i) => {
    if (out.length < t.col) out = out.padEnd(t.col, ' ');
    else if (out.length > 0) out += ' ';
    out += labels[i];
  });
  return out;
}

export function variantLabel(name: string, index: number, variants: number): string {
  return variants > 1 ? name + SUPERSCRIPT[index] : name;
}
