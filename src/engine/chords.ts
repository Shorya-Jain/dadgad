import { pitchClass } from './tuning';

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Intervals (semitones above root) for each canonical quality. */
export const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 2, 4, 7],
  madd9: [0, 2, 3, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '9': [0, 2, 4, 7, 10],
  m9: [0, 2, 3, 7, 10],
  maj9: [0, 2, 4, 7, 11],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
};

// Common spellings mapped to canonical qualities.
const ALIASES: Record<string, string> = {
  M: '', maj: '', major: '',
  min: 'm', '-': 'm', mi: 'm',
  sus: 'sus4', '2': 'sus2', add2: 'add9', add11: 'sus4',
  M7: 'maj7', Maj7: 'maj7', Δ: 'maj7', Δ7: 'maj7', ma7: 'maj7',
  min7: 'm7', '-7': 'm7', mi7: 'm7',
  '+': 'aug', '°': 'dim', o: 'dim', o7: 'dim7', '°7': 'dim7', ø: 'm7b5', ø7: 'm7b5',
  sus7: '7sus4', '7sus': '7sus4', '7sus2': 'sus2',
  min6: 'm6', '-6': 'm6', M9: 'maj9', Maj9: 'maj9', 'm(add9)': 'madd9', '(add9)': 'add9',
};

export interface Chord {
  root: number; // pitch class
  quality: string; // canonical key of QUALITIES
  bass: number; // pitch class of the bass note (root unless slash chord)
}

function parseNote(s: string): number | null {
  const m = /^([A-G])([#b]?)$/.exec(s);
  if (!m) return null;
  return pitchClass(NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
}

export function parseChord(name: string): Chord | null {
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(name.trim());
  if (!m) return null;
  const root = parseNote(m[1]);
  const q = m[2] in QUALITIES ? m[2] : ALIASES[m[2]];
  if (root === null || q === undefined) return null;
  const bass = m[3] ? parseNote(m[3]) : root;
  if (bass === null) return null;
  return { root, quality: q, bass };
}

export function chordName(c: Chord): string {
  const base = SHARP_NAMES[c.root] + c.quality;
  return c.bass === c.root ? base : `${base}/${SHARP_NAMES[c.bass]}`;
}

export function chordPCs(c: Chord): Set<number> {
  const pcs = new Set(QUALITIES[c.quality].map((i) => pitchClass(c.root + i)));
  pcs.add(c.bass);
  return pcs;
}

/** Name the chord formed by a set of pitches, or null if it isn't a recognisable chord. */
export function identifyChord(pitches: number[]): Chord | null {
  const pcs = new Set(pitches.map(pitchClass));
  if (pcs.size < 3) return null;
  const bass = pitchClass(Math.min(...pitches));
  // Prefer a root-position reading, then any slash-chord reading.
  const roots = [bass, ...[...pcs].filter((p) => p !== bass)];
  for (const root of roots) {
    for (const [quality, ivs] of Object.entries(QUALITIES)) {
      if (ivs.length !== pcs.size) continue;
      if (ivs.every((i) => pcs.has(pitchClass(root + i)))) return { root, quality, bass };
    }
  }
  return null;
}
