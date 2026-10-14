import { describe, expect, it } from 'vitest';
import { centsBetween, detectPitch, midiToFreq, nearestString, noteName } from '../src/tuner/pitch';

const SR = 48000;

/** A plucked-string-like tone: fundamental plus decaying harmonics. */
function tone(freq: number, n = 4096, harmonics = [1, 0.6, 0.4, 0.25]): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    buf[i] = harmonics.reduce((s, amp, h) => s + amp * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SR), 0) * 0.3;
  }
  return buf;
}

describe('detectPitch', () => {
  it.each([
    ['low D (D2)', 38],
    ['A (A2)', 45],
    ['D (D3)', 50],
    ['G (G3)', 55],
    ['A (A3)', 57],
    ['high D (D4)', 62],
  ])('finds %s within 2 cents', (_, midi) => {
    const f = midiToFreq(midi);
    const got = detectPitch(tone(f), SR)!;
    expect(Math.abs(centsBetween(got, midi))).toBeLessThan(2);
  });

  it('reads a slightly flat string correctly', () => {
    const flat = midiToFreq(45) * 2 ** (-15 / 1200); // A2, 15 cents flat
    expect(centsBetween(detectPitch(tone(flat), SR)!, 45)).toBeCloseTo(-15, 0);
  });

  it('returns null for silence and noise', () => {
    expect(detectPitch(new Float32Array(4096), SR)).toBeNull();
    const noise = new Float32Array(4096).map(() => Math.random() * 2 - 1);
    expect(detectPitch(noise, SR)).toBeNull();
  });
});

describe('nearestString', () => {
  it('picks the closest DADGAD string', () => {
    expect(nearestString(midiToFreq(55) * 1.01).string).toBe(3); // a bit sharp of G3
    expect(nearestString(midiToFreq(62)).string).toBe(5);
    expect(noteName(38)).toBe('D2');
    expect(noteName(56)).toBe('G#3');
  });
});
