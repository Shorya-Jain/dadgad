import { describe, expect, it } from 'vitest';
import { convert } from '../src/engine/convert';
import { transposeChordText } from '../src/engine/key';

// Original exercise material, not from any song.
const SHEET_IN_E = 'E        A        B7       E\nla la la la la la la la';
const SHEET_IN_D = 'D        G        A        D\nla la la la';

describe('transposeChordText', () => {
  it('moves roots and bass notes, keeping the quality', () => {
    expect(transposeChordText('Am7/G', 2)).toBe('Bm7/A');
    expect(transposeChordText('E', -2)).toBe('D');
    expect(transposeChordText('Bb', 2)).toBe('C');
    expect(transposeChordText('Eb', -2)).toBe('Db'); // keeps flat spelling
    expect(transposeChordText('(F#m)', 1)).toBe('(Gm)');
  });
});

describe('fitting the key to DADGAD', () => {
  it('auto key change moves a song in E to D and renames the chords', () => {
    const r = convert(SHEET_IN_E, 'idiomatic', undefined, { kind: 'key', amount: 'auto' });
    expect(r.key).toEqual({ kind: 'key', amount: -2 });
    expect(r.text).toContain('D        G        A7       D');
    expect(r.text).toContain('Transposed down 2 semitones');
  });

  it('auto capo keeps the original chord names and key', () => {
    const r = convert(SHEET_IN_E, 'idiomatic', undefined, { kind: 'capo', amount: 'auto' });
    expect(r.key).toEqual({ kind: 'capo', amount: 2 });
    expect(r.text).toContain('E        A        B7       E');
    expect(r.text).toContain('(D shape)');
    expect(r.text).toContain('Capo 2');
  });

  it('leaves a song already in D alone', () => {
    const r = convert(SHEET_IN_D, 'idiomatic', undefined, { kind: 'key', amount: 'auto' });
    expect(r.key.amount).toBe(0);
    expect(r.text).not.toContain('Transposed');
  });

  it('applies a manual shift to tab notes', () => {
    const tab = 'e|-----|\nB|-----|\nG|-----|\nD|-----|\nA|-----|\nE|--0--|'; // low E2
    const r = convert(tab, 'faithful', undefined, { kind: 'key', amount: -2 });
    const low = r.text.split('\n').filter((l) => /^[DAG]\|/.test(l)).pop()!;
    expect(low).toContain('0'); // E2 down 2 = D2 = open low D string
  });
});
