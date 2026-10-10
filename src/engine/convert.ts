import { chordName } from './chords';
import {
  CAPO_RANGE,
  KEY_RANGE,
  KeyOptions,
  ORIGINAL_KEY,
  describeKey,
  openStringFit,
  pitchShift,
  shiftSections,
} from './key';
import { Candidate, Mode, bestPath, candidatesForNotes } from './optimize';
import { Section, parse } from './parse';
import { Placement, renderChordLine, renderTab, variantLabel } from './render';
import { Frets, STANDARD_SOURCE, Source, fretsToString, tuningName } from './tuning';
import { voicingsFor } from './voicings';

export interface ChordShape {
  label: string;
  frets: Frets;
}

export interface ConvertResult {
  text: string;
  chords: ChordShape[];
  /** The key change or capo actually used (resolves 'auto'). */
  key: { kind: KeyOptions['kind']; amount: number };
}

const EMPTY: Candidate = { frets: [null, null, null, null, null, null], cost: 0, revoiced: false };

/** One slot per tab event or chord name, in song order, so the optimiser sees the whole song. */
function buildSlots(sections: Section[], mode: Mode): Candidate[][] {
  const slots: Candidate[][] = [];
  for (const sec of sections) {
    if (sec.kind === 'tab') {
      for (const e of sec.block.events) slots.push(candidatesForNotes(e.notes.map((n) => n.pitch), mode));
    } else if (sec.kind === 'chords') {
      for (const t of sec.tokens) {
        if (t.chord) slots.push(voicingsFor(t.chord).map((v) => ({ frets: v.frets, cost: v.difficulty, revoiced: false })));
      }
    }
  }
  return slots.map((s) => (s.length ? s : [EMPTY]));
}

/** Try each shift; lower is better. Rewards notes that ring with the open strings, then easy fingering. */
function arrange(sections: Section[], mode: Mode, key: KeyOptions) {
  const amounts = key.amount === 'auto' ? (key.kind === 'capo' ? CAPO_RANGE : KEY_RANGE) : [key.amount];
  let best: { amount: number; sections: Section[]; slots: Candidate[][]; picks: number[]; score: number } | null = null;
  for (const amount of amounts) {
    const shifted = shiftSections(sections, pitchShift(key.kind, amount), key.kind === 'key');
    const slots = buildSlots(shifted, mode);
    const { picks, cost } = bestPath(slots);
    // Small penalty per semitone so the original key wins unless the change clearly helps.
    const score = cost / Math.max(slots.length, 1) - 3 * openStringFit(shifted) + 0.08 * Math.abs(amount);
    if (!best || score < best.score) best = { amount, sections: shifted, slots, picks, score };
  }
  return best!;
}

const SECTION_HEADER = /^\s*\[[^\]]+\]\s*$/;
const SEPARATOR = /^\s*[-=_*~#.]{3,}\s*$/;
const METADATA =
  /^\s*((tabbed|transcribed|arranged|written|tab|chords)\s+by|e-?mail|tuning|capo|author|difficulty|key|strumming|note|notes|tip|tips)\b/i;

/**
 * Keep only what you need to play: section headers, tabs, chord lines and lyrics.
 * Drops the preamble before the music starts, separator lines, and notes about the
 * original tuning/capo/author (a metadata line takes the rest of its paragraph with it).
 */
export function cleanSections(sections: Section[]): Section[] {
  const isText = (s: Section): s is Extract<Section, { kind: 'text' }> => s.kind === 'text';
  const start = sections.findIndex((s) => !isText(s) || SECTION_HEADER.test(s.line));
  const out: Section[] = [];
  let skipping = false;
  for (const s of sections.slice(Math.max(start, 0))) {
    if (!isText(s)) {
      skipping = false;
      out.push(s);
      continue;
    }
    const blank = s.line.trim() === '';
    if (blank) skipping = false;
    else if (METADATA.test(s.line)) skipping = true;
    if (skipping || SEPARATOR.test(s.line)) continue;
    const prev = out[out.length - 1];
    if (blank && (!prev || (isText(prev) && prev.line.trim() === ''))) continue; // collapse blank runs
    out.push(s);
  }
  return out;
}

function describeSource(src: Source): string | null {
  const standard = src.tuning.join() === STANDARD_SOURCE.tuning.join();
  if (standard && src.capo === 0) return null;
  const capo = src.capo ? `, capo ${src.capo}${src.capoSkipsLow ? ' (not on the low string)' : ''}` : '';
  return `Converted from: ${standard ? 'standard' : tuningName(src.tuning)}${capo}`;
}

/**
 * Convert a tab or chord sheet in the given source tuning (standard by default) to DADGAD,
 * optionally transposing or adding a capo so the song suits DADGAD's open strings.
 */
export function convert(
  input: string,
  mode: Mode = 'idiomatic',
  source: Source = STANDARD_SOURCE,
  key: KeyOptions = ORIGINAL_KEY,
): ConvertResult {
  const best = arrange(cleanSections(parse(input, source)), mode, key);
  const sections = best.sections;
  const placed: Placement[] = best.picks.map((p, i) => best.slots[i][p]);

  // Name the shapes used for each chord; a chord played two ways becomes G¹ and G².
  const variants = new Map<string, string[]>(); // chord text -> distinct fret strings
  const shapeOf = new Map<string, string>(); // with a capo: chord text -> shape played, e.g. "E" -> "D"
  const capo = key.kind === 'capo' && best.amount > 0;
  let i = 0;
  for (const sec of sections) {
    if (sec.kind === 'tab') i += sec.block.events.length;
    if (sec.kind !== 'chords') continue;
    for (const t of sec.tokens) {
      if (!t.chord) continue;
      if (capo) shapeOf.set(t.text, chordName(t.chord));
      const list = variants.get(t.text) ?? [];
      const key = fretsToString(placed[i++].frets);
      if (!list.includes(key)) list.push(key);
      variants.set(t.text, list);
    }
  }

  const body: string[] = [];
  const chords: ChordShape[] = [];
  i = 0;
  for (const sec of sections) {
    if (sec.kind === 'text') body.push(sec.line);
    else if (sec.kind === 'tab') {
      const n = sec.block.events.length;
      body.push(...renderTab(sec.block, placed.slice(i, i + n)));
      i += n;
    } else {
      const labels = sec.tokens.map((t) => {
        if (!t.chord) return t.text;
        const list = variants.get(t.text)!;
        const idx = list.indexOf(fretsToString(placed[i++].frets));
        return variantLabel(t.text, idx, list.length);
      });
      body.push(renderChordLine(sec.tokens, labels));
    }
  }

  for (const [name, list] of variants) {
    list.forEach((key, idx) => {
      chords.push({
        label: variantLabel(name, idx, list.length),
        frets: key.split(' ').map((f) => (f === 'x' ? null : Number(f))),
      });
    });
  }

  const header = ['Tuning: DADGAD (low to high: D A D G A D)'];
  const from = describeSource(source);
  if (from) header.push(from);
  const moved = describeKey(key.kind, best.amount);
  if (moved) header.push(moved);
  if (chords.length) {
    header.push('', `Chord shapes (low D string first${capo ? ', frets from the capo' : ''}):`);
    for (const c of chords) {
      const base = c.label.replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, '');
      const shape = shapeOf.get(base);
      header.push(`  ${c.label.padEnd(8)} ${fretsToString(c.frets)}${shape ? `   (${shape} shape)` : ''}`);
    }
  }
  if (placed.some((p) => p.revoiced)) header.push('', '* = re-voiced for DADGAD (same harmony, different shape)');
  return { text: [...header, '', ...body].join('\n'), chords, key: { kind: key.kind, amount: best.amount } };
}
