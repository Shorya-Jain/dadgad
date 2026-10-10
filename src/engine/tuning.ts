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
