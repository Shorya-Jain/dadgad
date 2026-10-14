import { DADGAD } from '../engine/tuning';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
export const centsBetween = (freq: number, midi: number) => 1200 * Math.log2(freq / midiToFreq(midi));

/** The six DADGAD strings, low to high, as MIDI notes. */
export const STRINGS = DADGAD;

/** Which DADGAD string a frequency is closest to, and how far off it is in cents. */
export function nearestString(freq: number): { string: number; cents: number } {
  let best = { string: 0, cents: Infinity };
  STRINGS.forEach((m, string) => {
    const cents = centsBetween(freq, m);
    if (Math.abs(cents) < Math.abs(best.cents)) best = { string, cents };
  });
  return best;
}

/**
 * Fundamental frequency of a mono buffer using the YIN algorithm, or null if there's
 * no clear pitch (silence, noise). Tuned for guitar: 60–1000 Hz.
 */
export function detectPitch(buf: Float32Array, sampleRate: number, minHz = 60, maxHz = 1000): number | null {
  let rms = 0;
  for (const x of buf) rms += x * x;
  if (Math.sqrt(rms / buf.length) < 0.01) return null;

  const W = Math.floor(buf.length / 2);
  const tauMin = Math.floor(sampleRate / maxHz);
  const tauMax = Math.min(Math.floor(sampleRate / minHz), W - 1);
  if (tauMax <= tauMin) return null;

  // Difference function, then cumulative-mean-normalised difference.
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    cmnd[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // First dip below the threshold, followed down to its local minimum.
  const THRESHOLD = 0.15;
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < THRESHOLD) {
      while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Parabolic interpolation for sub-sample accuracy.
  const [a, b, c] = [cmnd[tau - 1] ?? cmnd[tau], cmnd[tau], cmnd[tau + 1] ?? cmnd[tau]];
  const shift = a + c - 2 * b === 0 ? 0 : (a - c) / (2 * (a + c - 2 * b));
  return sampleRate / (tau + shift);
}
