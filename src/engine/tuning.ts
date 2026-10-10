// Strings are indexed 0 = lowest (6th string) .. 5 = highest (1st string).
// Pitches are MIDI note numbers (E2 = 40).

export const STANDARD = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4
export const DADGAD = [38, 45, 50, 55, 57, 62]; // D2 A2 D3 G3 A3 D4
export const DADGAD_LABELS = ['D', 'A', 'D', 'G', 'A', 'D'];

export const MAX_FRET = 15;

/** A placement on the target tuning: fret per string, null = not played. */
export type Frets = (number | null)[];

export const pitchClass = (p: number) => ((p % 12) + 12) % 12;

/** Strings (on DADGAD) where a pitch can be played, with the fret. */
export function positionsFor(pitch: number): { string: number; fret: number }[] {
  const out = [];
  for (let s = 0; s < 6; s++) {
    const fret = pitch - DADGAD[s];
    if (fret >= 0 && fret <= MAX_FRET) out.push({ string: s, fret });
  }
  return out;
}

export function pitchesOf(frets: Frets): number[] {
  const out: number[] = [];
  frets.forEach((f, s) => {
    if (f !== null) out.push(DADGAD[s] + f);
  });
  return out;
}

export function fretsToString(frets: Frets): string {
  return frets.map((f) => (f === null ? 'x' : String(f))).join(' ');
}

// ---- Source (input) tuning: what the tab was written for ----

export interface Source {
  tuning: number[]; // MIDI pitch of each open string, low to high
  capo: number; // fret numbers in the tab are relative to the capo
  capoSkipsLow: boolean; // partial capo that leaves the low string open
}

export const STANDARD_SOURCE: Source = { tuning: STANDARD, capo: 0, capoSkipsLow: false };

export function sourcePitch(src: Source, string: number, fret: number): number {
  const capo = src.capoSkipsLow && string === 0 ? 0 : src.capo;
  return src.tuning[string] + capo + fret;
}

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function notesIn(s: string, flats: boolean): number[] {
  const re = flats ? /([A-Ga-g])([#♯b♭]?)/g : /([A-Ga-g])([#♯]?)/g;
  return [...s.matchAll(re)].map((m) => {
    const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
    return pitchClass(NOTE_PC[m[1].toUpperCase()] + acc);
  });
}

/**
 * Read six note names (low to high) such as "DADGAD", "D A C A G d" or "Eb Ab Db Gb Bb Eb".
 * Each string gets the octave closest to the standard-tuning string it replaces.
 */
export function parseTuning(s: string): number[] | null {
  // A lowercase "b" can be a flat or the B string ("EADGbe"); try flats first.
  let pcs = notesIn(s, true);
  if (pcs.length !== 6) pcs = notesIn(s, false);
  if (pcs.length !== 6) return null;
  return pcs.map((pc, i) => {
    const std = STANDARD[i];
    const below = std - pitchClass(std - pc);
    return std - below <= below + 12 - std ? below : below + 12;
  });
}

export function tuningName(tuning: number[]): string {
  return tuning.map((p) => NAMES[pitchClass(p)]).join(' ');
}
