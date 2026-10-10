import { Chord, parseChord } from './chords';
import { STANDARD } from './tuning';

export interface Note {
  string: number; // 0 = low E .. 5 = high e (standard tuning)
  fret: number;
  pitch: number;
}

export interface TabEvent {
  notes: Note[];
  width: number; // characters the event occupied in the source
}

/** A 6-line tab block. Lines are top-to-bottom as written (line 0 = high e = string 5). */
export interface TabBlock {
  /** gaps[k][line] = text on that line before event k; gaps[events.length] is the tail. */
  gaps: string[][];
  events: TabEvent[];
}

export interface ChordToken {
  text: string;
  col: number;
  chord: Chord | null; // null for bar lines, repeat marks, N.C.
}

export type Section =
  | { kind: 'text'; line: string }
  | { kind: 'tab'; block: TabBlock }
  | { kind: 'chords'; tokens: ChordToken[] };

const PREFIX = /^\s*(?:[A-Ga-g][#b]?)?\s*[|:]?/;
const TAB_BODY = /^[-0-9|hpbrsxv~/\\()^.*=<>tSHP ]+$/;

export function isTabLine(line: string): boolean {
  const body = line.slice(PREFIX.exec(line)![0].length).trimEnd();
  return body.length >= 3 && (body.match(/-/g)?.length ?? 0) >= 2 && TAB_BODY.test(body);
}

const NON_CHORD_TOKEN = /^(\||\|\||[x×]\d+|N\.?C\.?|-+|\/+|%)$/i;

function parseChordLine(line: string): ChordToken[] | null {
  const tokens: ChordToken[] = [];
  let chords = 0;
  for (const m of line.matchAll(/\S+/g)) {
    const text = m[0];
    if (NON_CHORD_TOKEN.test(text)) {
      tokens.push({ text, col: m.index!, chord: null });
      continue;
    }
    const chord = parseChord(text.replace(/^\(|\)$/g, ''));
    if (!chord) return null;
    chords++;
    tokens.push({ text, col: m.index!, chord });
  }
  return chords > 0 ? tokens : null;
}

function parseBlock(lines: string[]): TabBlock {
  const bodies = lines.map((l) => l.slice(PREFIX.exec(l)![0].length).trimEnd());
  const len = Math.max(...bodies.map((b) => b.length));
  const padded = bodies.map((b) => b.padEnd(len, ' '));

  // Digit runs on each line; overlapping runs across lines form one event.
  const runs: { line: number; start: number; end: number; fret: number }[] = [];
  padded.forEach((b, line) => {
    for (const m of b.matchAll(/\d+/g)) {
      runs.push({ line, start: m.index!, end: m.index! + m[0].length, fret: Number(m[0]) });
    }
  });
  runs.sort((a, b) => a.start - b.start);

  const spans: { start: number; end: number; runs: typeof runs }[] = [];
  for (const r of runs) {
    const last = spans[spans.length - 1];
    if (last && r.start < last.end) {
      last.end = Math.max(last.end, r.end);
      last.runs.push(r);
    } else spans.push({ start: r.start, end: r.end, runs: [r] });
  }

  const gaps: string[][] = [];
  let prev = 0;
  for (const sp of spans) {
    gaps.push(padded.map((b) => b.slice(prev, sp.start)));
    prev = sp.end;
  }
  gaps.push(padded.map((b) => b.slice(prev)));

  const events = spans.map((sp) => ({
    width: sp.end - sp.start,
    notes: sp.runs.map((r) => {
      const string = 5 - r.line;
      return { string, fret: r.fret, pitch: STANDARD[string] + r.fret };
    }),
  }));
  return { gaps, events };
}

export function parse(text: string): Section[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Section[] = [];
  for (let i = 0; i < lines.length; ) {
    let j = i;
    while (j < lines.length && isTabLine(lines[j])) j++;
    if (j - i === 6) {
      out.push({ kind: 'tab', block: parseBlock(lines.slice(i, j)) });
      i = j;
      continue;
    }
    // Not a 6-line block (e.g. bass tab): pass the lines through untouched.
    if (j > i) {
      for (; i < j; i++) out.push({ kind: 'text', line: lines[i] });
      continue;
    }
    const tokens = parseChordLine(lines[i]);
    out.push(tokens ? { kind: 'chords', tokens } : { kind: 'text', line: lines[i] });
    i++;
  }
  return out;
}
