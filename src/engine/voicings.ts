import { Chord, QUALITIES, chordName, chordPCs } from './chords';
import { DADGAD, Frets, pitchClass } from './tuning';
import library from '../data/dadgad-chords.json';
import overrides from '../data/overrides.json';

export interface Voicing {
  frets: Frets;
  difficulty: number;
}

/** Fingers needed for a placement, allowing a barre at the lowest fret. */
export function fingersNeeded(frets: Frets): number {
  const fretted = frets.map((f, s) => [f, s] as const).filter(([f]) => f !== null && f > 0) as [number, number][];
  if (fretted.length === 0) return 0;
  const min = Math.min(...fretted.map(([f]) => f));
  const atMin = fretted.filter(([f]) => f === min).map(([, s]) => s);
  if (atMin.length >= 2) {
    const lo = atMin[0], hi = atMin[atMin.length - 1];
    // A barre can't cover an open string between its ends.
    const barreOk = frets.slice(lo, hi + 1).every((f) => f === null || f >= min);
    if (barreOk) return 1 + fretted.filter(([f]) => f > min).length;
  }
  return fretted.length;
}

export function fretSpan(frets: Frets): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
}

/** Hand position: lowest fretted fret, 0 when everything is open. */
export function position(frets: Frets): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length ? Math.min(...fretted) : 0;
}

const COLOUR_QUALITIES = new Set(['', 'm', '7', 'm7', 'maj7', '6']);

function chordDifficulty(frets: Frets, chord: Chord): number {
  const sounding = frets.map((f, s) => (f === null ? null : s)).filter((s): s is number => s !== null);
  const first = sounding[0], last = sounding[sounding.length - 1];
  const interiorMutes = frets.slice(first, last + 1).filter((f) => f === null).length;
  const trailingMutes = 5 - last;
  const opens = frets.filter((f) => f === 0).length;
  const pcs = frets.map((f, s) => (f === null ? -1 : pitchClass(DADGAD[s] + f)));
  const tones = chordPCs(chord);
  const colour = pcs.filter((p) => p >= 0 && !tones.has(p)).length;
  const hasFifth = pcs.includes(pitchClass(chord.root + 7));
  const missingFifth = QUALITIES[chord.quality].includes(7) && !hasFifth ? 1 : 0;
  return (
    fingersNeeded(frets) * 0.6 +
    fretSpan(frets) * 0.8 +
    interiorMutes * 3 + // muting an inner string while strumming is awkward
    trailingMutes * 0.5 +
    position(frets) * 0.08 -
    opens * 0.3 -
    sounding.length * 0.2 +
    missingFifth * 0.5 +
    colour * 0.4
  );
}

/** Enumerate playable DADGAD voicings of a chord and keep a few spread across the neck. */
export function generateVoicings(chord: Chord, keep = 6): Voicing[] {
  const tones = chordPCs(chord);
  const ivs = QUALITIES[chord.quality];
  const required = new Set(
    ivs.filter((i) => chord.quality === '5' || i !== 7).map((i) => pitchClass(chord.root + i)),
  );
  required.add(chord.bass);
  // DADGAD's charm: open strings may add a 9th as colour to plain chords.
  const colourPC = COLOUR_QUALITIES.has(chord.quality) ? pitchClass(chord.root + 2) : -1;

  const seen = new Map<string, Voicing>();
  for (let base = 1; base <= 12; base++) {
    const options: Frets[number][][] = DADGAD.map((open) => {
      const opts: Frets[number][] = [null];
      const openPC = pitchClass(open);
      if (tones.has(openPC) || openPC === colourPC) opts.push(0);
      for (let f = base; f <= base + 3; f++) if (tones.has(pitchClass(open + f))) opts.push(f);
      return opts;
    });
    const cur: Frets = [];
    const visit = (s: number) => {
      if (s === 6) {
        if (!isValid(cur, chord, required)) return;
        const key = cur.join(',');
        if (!seen.has(key)) seen.set(key, { frets: [...cur], difficulty: chordDifficulty(cur, chord) });
        return;
      }
      for (const o of options[s]) {
        cur.push(o);
        visit(s + 1);
        cur.pop();
      }
    };
    visit(0);
  }

  const all = [...seen.values()].sort((a, b) => a.difficulty - b.difficulty);
  // Take the best two in each region of the neck, then fill with the best remaining.
  const region = (v: Voicing) => (position(v.frets) <= 4 ? 0 : position(v.frets) <= 8 ? 1 : 2);
  const picked: Voicing[] = [];
  for (const r of [0, 1, 2]) picked.push(...all.filter((v) => region(v) === r).slice(0, 2));
  for (const v of all) {
    if (picked.length >= keep) break;
    if (!picked.includes(v)) picked.push(v);
  }
  return picked.slice(0, keep).sort((a, b) => a.difficulty - b.difficulty);
}

function isValid(frets: Frets, chord: Chord, required: Set<number>): boolean {
  const sounding = frets.filter((f) => f !== null).length;
  if (sounding < 4) return false;
  const first = frets.findIndex((f) => f !== null);
  if (pitchClass(DADGAD[first] + frets[first]!) !== chord.bass) return false;
  const pcs = new Set(frets.map((f, s) => (f === null ? -1 : pitchClass(DADGAD[s] + f))));
  for (const r of required) if (!pcs.has(r)) return false;
  if (fretSpan(frets) > 3) return false;
  return fingersNeeded(frets) <= 4;
}

// ---- Runtime lookup: hand-picked overrides first, then the precomputed library. ----

const LIB = library as Record<string, Voicing[]>;
const OVERRIDES = overrides as Record<string, Frets[]>;
const memo = new Map<string, Voicing[]>();

export function voicingsFor(chord: Chord): Voicing[] {
  const name = chordName(chord);
  const hit = memo.get(name);
  if (hit) return hit;
  const favourites = (OVERRIDES[name] ?? []).map((frets) => ({
    frets,
    difficulty: chordDifficulty(frets, chord) - 1, // favourites win ties
  }));
  const rest = LIB[name] ?? generateVoicings(chord);
  const keys = new Set(favourites.map((v) => v.frets.join(',')));
  const result = [...favourites, ...rest.filter((v) => !keys.has(v.frets.join(',')))];
  memo.set(name, result);
  return result;
}
