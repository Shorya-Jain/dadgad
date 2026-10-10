import { parse } from './parse';
import { STANDARD, STANDARD_SOURCE, Source, parseTuning } from './tuning';

export interface Detection {
  source: Source;
  /** Human-readable notes on what was found, e.g. "tuning from 'Tuning:' line". */
  found: string[];
  /** The tab mentions a tuning we couldn't read, so the user should check it. */
  unsure: boolean;
}

const NAMED: [RegExp, number[]][] = [
  [/\bdrop\s*d\b/i, [38, 45, 50, 55, 59, 64]],
  [/\b(half\s*step\s*down|e\s*b\s*standard|eb\s*tuning)\b/i, STANDARD.map((p) => p - 1)],
  [/\bstandard\b/i, STANDARD],
];

/** A line that is nothing but six note names, e.g. "DADGAD" or "D A C A G d". */
const TUNING_ONLY = /^\s*(?:[A-Ga-g][#b♯♭]?\s*){6}\s*$/;

function tuningFromText(lines: string[]): { tuning: number[] | null; mentioned: boolean } {
  const idx = lines.findIndex((l) => /^\s*tuning\b/i.test(l));
  if (idx < 0) return { tuning: null, mentioned: false };
  const rest = lines[idx].replace(/^\s*tuning\s*:?/i, '');
  // Look at the "Tuning:" line itself, then the next few lines.
  const window = [rest, ...lines.slice(idx + 1, idx + 12)];
  for (const l of window) {
    if (TUNING_ONLY.test(l)) return { tuning: parseTuning(l), mentioned: true };
    for (const [re, t] of NAMED) if (re.test(l)) return { tuning: t, mentioned: true };
  }
  return { tuning: null, mentioned: rest.trim() !== '' || window.some((l) => l.trim() !== '') };
}

/** Guess the tab's tuning and capo from its text and string labels. */
export function detectSource(text: string): Detection {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const source: Source = { ...STANDARD_SOURCE };
  const found: string[] = [];

  const fromText = tuningFromText(lines);
  let unsure = false;
  if (fromText.tuning) {
    source.tuning = fromText.tuning;
    found.push('tuning');
  } else {
    // Fall back to the string names written at the start of each tab line (top line = highest string).
    const block = parse(text).find((s) => s.kind === 'tab');
    const labels = block?.kind === 'tab' ? block.block.labels : [];
    const fromLabels = labels.every((l) => l) ? parseTuning([...labels].reverse().join(' ')) : null;
    if (fromLabels && fromLabels.join() !== STANDARD.join()) {
      source.tuning = fromLabels;
      found.push('tuning (from string names)');
    } else unsure = fromText.mentioned;
  }

  const capo = /\bcapo\b[^\n\d]{0,40}?(\d{1,2})(?:st|nd|rd|th)?/i.exec(text);
  if (capo && !/\bno\s+capo\b/i.test(capo[0])) {
    source.capo = Number(capo[1]);
    found.push(`capo ${source.capo}`);
    const partial =
      /partial\s+capo|capo[^\n]{0,80}?\b(5|five)\s+strings|\b(5|five)[- ]string\s+capo|capo[^\n]{0,80}?(not|doesn't|does not|won't)\s+(cover|go over|go across)[^\n]{0,30}low/i;
    if (partial.test(text)) {
      source.capoSkipsLow = true;
      found.push('capo not on the low string');
    }
  }
  return { source, found, unsure };
}
