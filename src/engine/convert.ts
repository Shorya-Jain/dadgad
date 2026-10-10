import { Candidate, Mode, candidatesForNotes, choose } from './optimize';
import { parse } from './parse';
import { Placement, renderChordLine, renderTab, variantLabel } from './render';
import { Frets, fretsToString } from './tuning';
import { voicingsFor } from './voicings';

export interface ChordShape {
  label: string;
  frets: Frets;
}

export interface ConvertResult {
  text: string;
  chords: ChordShape[];
}

/** Convert a standard-tuning tab or chord sheet to DADGAD. */
export function convert(input: string, mode: Mode = 'idiomatic'): ConvertResult {
  const sections = parse(input);

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
  if (chords.length) {
    header.push('', 'Chord shapes (low D string first):');
    for (const c of chords) header.push(`  ${c.label.padEnd(8)} ${fretsToString(c.frets)}`);
  }
  if (placed.some((p) => p.revoiced)) header.push('', '* = re-voiced for DADGAD (same harmony, different shape)');
  return { text: [...header, '', ...body].join('\n'), chords };
}
