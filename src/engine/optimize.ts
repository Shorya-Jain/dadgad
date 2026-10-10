import { identifyChord } from './chords';
import { DADGAD, Frets, MAX_FRET, pitchClass, positionsFor } from './tuning';
import { fingersNeeded, fretSpan, position, voicingsFor } from './voicings';

export type Mode = 'faithful' | 'idiomatic';

export interface Candidate {
  frets: Frets;
  cost: number;
  revoiced: boolean;
}

const TOP_K = 30;

/** How hard a placement is to fret on its own. */
export function staticCost(frets: Frets): number {
  const span = fretSpan(frets);
  const fingers = fingersNeeded(frets);
  const opens = frets.filter((f) => f === 0).length;
  return (
    span * 0.8 +
    Math.max(0, span - 3) * 6 +
    fingers * 0.4 +
    (fingers > 4 ? 50 : 0) +
    position(frets) * 0.1 -
    opens * 0.3
  );
}

/** Hand centre: mean fretted fret, or null when nothing is fretted (hand is free to move). */
function handPos(frets: Frets): number | null {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : null;
}

export function transitionCost(a: Frets, b: Frets): number {
  const pa = handPos(a), pb = handPos(b);
  if (pa === null || pb === null) return 0;
  const d = Math.abs(pa - pb);
  return d * 0.5 + Math.max(0, d - 4);
}

/** Every way to put each pitch on a distinct DADGAD string. */
export function assignments(pitches: number[]): Frets[] {
  const sorted = [...new Set(pitches)].sort((a, b) => a - b);
  const out: Frets[] = [];
  const cur: Frets = [null, null, null, null, null, null];
  const visit = (i: number) => {
    if (i === sorted.length) {
      out.push([...cur]);
      return;
    }
    for (const { string, fret } of positionsFor(sorted[i])) {
      if (cur[string] !== null) continue;
      cur[string] = fret;
      visit(i + 1);
      cur[string] = null;
    }
  };
  visit(0);
  return out;
}

const LOWEST = DADGAD[0];
const HIGHEST = DADGAD[5] + MAX_FRET;

/** Move notes outside DADGAD's range (e.g. from a high capo) by octaves until they fit. */
function intoRange(p: number): number {
  while (p < LOWEST) p += 12;
  while (p > HIGHEST) p -= 12;
  return p;
}

export function candidatesForNotes(pitches: number[], mode: Mode): Candidate[] {
  const cands: Candidate[] = assignments(pitches).map((frets) => ({
    frets,
    cost: staticCost(frets),
    revoiced: false,
  }));
  if (cands.length === 0) {
    // Some notes can't be played in DADGAD as written; octave-shift them rather than drop them.
    for (const frets of assignments(pitches.map(intoRange))) {
      cands.push({ frets, cost: staticCost(frets) + 2, revoiced: true });
    }
  }

  if (mode === 'idiomatic' && new Set(pitches.map(pitchClass)).size >= 3) {
    const sorted = [...new Set(pitches)].sort((a, b) => a - b);
    const bass = sorted[0], top = sorted[sorted.length - 1];

    // Swap in a saved chord shape, preferring ones that keep the melody (top) and bass notes.
    const chord = identifyChord(pitches);
    if (chord) {
      for (const v of voicingsFor(chord)) {
        const sounding = v.frets.flatMap((f, s) => (f === null ? [] : [s]));
        const vTop = positionsPitch(v.frets, sounding[sounding.length - 1]);
        const vBass = positionsPitch(v.frets, sounding[0]);
        cands.push({
          frets: v.frets,
          cost: v.difficulty + 1 + (vTop === top ? 0 : 2) + (vBass === bass ? 0 : 0.5),
          revoiced: true,
        });
      }
    }

    // Move one inner note up or down an octave.
    for (let i = 1; i < sorted.length - 1; i++) {
      for (const shift of [-12, 12]) {
        const moved = sorted.map((p, j) => (j === i ? p + shift : p));
        if (moved[i] <= bass || moved[i] >= top) continue;
        for (const frets of assignments(moved)) {
          cands.push({ frets, cost: staticCost(frets) + 1, revoiced: true });
        }
      }
    }
  }

  return cands.sort((a, b) => a.cost - b.cost).slice(0, TOP_K);
}

function positionsPitch(frets: Frets, s: number): number {
  return DADGAD[s] + frets[s]!;
}

/** Viterbi: pick one candidate per slot minimising total static + transition cost. */
export function choose(slots: Candidate[][]): number[] {
  return bestPath(slots).picks;
}

export function bestPath(slots: Candidate[][]): { picks: number[]; cost: number } {
  if (slots.length === 0) return { picks: [], cost: 0 };
  let cost = slots[0].map((c) => c.cost);
  const back: number[][] = [];
  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1];
    const ptr: number[] = [];
    cost = slots[i].map((c) => {
      let best = Infinity, arg = 0;
      prev.forEach((p, j) => {
        const v = cost[j] + transitionCost(p.frets, c.frets);
        if (v < best) [best, arg] = [v, j];
      });
      ptr.push(arg);
      return best + c.cost;
    });
    back.push(ptr);
  }
  const total = Math.min(...cost);
  const picks = [cost.indexOf(total)];
  for (let i = back.length - 1; i >= 0; i--) picks.unshift(back[i][picks[0]]);
  return { picks, cost: total };
}
