import { Candidate, Mode, candidatesForNotes, choose } from './optimize';
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

/** Convert a tab or chord sheet in the given source tuning (standard by default) to DADGAD. */
export function convert(input: string, mode: Mode = 'idiomatic', source: Source = STANDARD_SOURCE): ConvertResult {
  const sections = cleanSections(parse(input, source));

  // One slot per tab event or chord name, in song order, so the optimiser sees the whole song.
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
  // Drop slots with no possible placement (shouldn't happen for 6-string standard tabs).
  const picks = choose(slots.map((s) => (s.length ? s : [{ frets: [null, null, null, null, null, null], cost: 0, revoiced: false }])));
  const placed: Placement[] = picks.map((p, i) => slots[i][p] ?? { frets: [null, null, null, null, null, null], revoiced: false });

  // Name the shapes used for each chord; a chord played two ways becomes G¹ and G².
  const variants = new Map<string, string[]>(); // chord text -> distinct fret strings
  let i = 0;
  for (const sec of sections) {
    if (sec.kind === 'tab') i += sec.block.events.length;
    if (sec.kind !== 'chords') continue;
    for (const t of sec.tokens) {
      if (!t.chord) continue;
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
  if (chords.length) {
    header.push('', 'Chord shapes (low D string first):');
    for (const c of chords) header.push(`  ${c.label.padEnd(8)} ${fretsToString(c.frets)}`);
  }
  if (placed.some((p) => p.revoiced)) header.push('', '* = re-voiced for DADGAD (same harmony, different shape)');
  return { text: [...header, '', ...body].join('\n'), chords };
}
