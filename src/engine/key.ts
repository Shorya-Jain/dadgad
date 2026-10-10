import { Chord, SHARP_NAMES } from './chords';
import { Section } from './parse';
import { pitchClass } from './tuning';

/**
 * How to move the song so it suits DADGAD:
 * - 'key':  transpose by `amount` semitones (the song sounds higher/lower; chord names change).
 * - 'capo': play with a capo at fret `amount` (shapes move down, the song keeps its original key).
 * `amount: 'auto'` tries every option and keeps the one that rings and plays best.
 */
export interface KeyOptions {
  kind: 'key' | 'capo';
  amount: number | 'auto';
}

export const ORIGINAL_KEY: KeyOptions = { kind: 'key', amount: 0 };
export const KEY_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
export const CAPO_RANGE = [0, 1, 2, 3, 4, 5, 6, 7];

/** Pitch shift applied to the music for a given option. */
export const pitchShift = (kind: KeyOptions['kind'], amount: number) => (kind === 'capo' ? -amount : amount);

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Rename a chord symbol's root and bass, e.g. ("Am7/G", +2) -> "Bm7/A". Keeps flat spelling if used. */
export function transposeChordText(text: string, shift: number): string {
  const flats = /^[(]?[A-G]b/.test(text);
  return text.replace(/(^\(?|\/)([A-G])([#b]?)/g, (_, pre: string, n: string, acc: string) => {
    const pc = pitchClass(NOTE_PC[n] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + shift);
    return pre + (flats ? FLAT_NAMES : SHARP_NAMES)[pc];
  });
}

const shiftChord = (c: Chord, s: number): Chord => ({ ...c, root: pitchClass(c.root + s), bass: pitchClass(c.bass + s) });

/** Move every note and chord by `shift` semitones. Chord names are rewritten only if `rename`. */
export function shiftSections(sections: Section[], shift: number, rename: boolean): Section[] {
  if (shift === 0) return sections;
  return sections.map((s) => {
    if (s.kind === 'tab') {
      const events = s.block.events.map((e) => ({ ...e, notes: e.notes.map((n) => ({ ...n, pitch: n.pitch + shift })) }));
      return { kind: 'tab', block: { ...s.block, events } };
    }
    if (s.kind === 'chords') {
      const tokens = s.tokens.map((t) =>
        t.chord ? { ...t, chord: shiftChord(t.chord, shift), text: rename ? transposeChordText(t.text, shift) : t.text } : t,
      );
      return { kind: 'chords', tokens };
    }
    return s;
  });
}

const OPEN_PCS = new Set([2, 7, 9]); // D, G, A: DADGAD's open strings

/** Share of the song's notes that are D, G or A, i.e. that ring with DADGAD's open strings. */
export function openStringFit(sections: Section[]): number {
  let hit = 0, total = 0;
  const count = (pc: number) => {
    total++;
    if (OPEN_PCS.has(pc)) hit++;
  };
  for (const s of sections) {
    if (s.kind === 'tab') for (const e of s.block.events) for (const n of e.notes) count(pitchClass(n.pitch));
    if (s.kind === 'chords') for (const t of s.tokens) if (t.chord) [t.chord.root, pitchClass(t.chord.root + 7)].forEach(count);
  }
  return total ? hit / total : 0;
}

export function describeKey(kind: KeyOptions['kind'], amount: number): string | null {
  if (amount === 0) return null;
  if (kind === 'capo') return `Capo ${amount}: frets are counted from the capo. Sounds in the original key.`;
  return `Transposed ${amount > 0 ? 'up' : 'down'} ${Math.abs(amount)} semitone${Math.abs(amount) > 1 ? 's' : ''} to suit DADGAD (chord names changed to match).`;
}
