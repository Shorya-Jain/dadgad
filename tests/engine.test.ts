import { describe, expect, it } from 'vitest';
import { chordPCs, identifyChord, parseChord } from '../src/engine/chords';
import { convert } from '../src/engine/convert';
import { candidatesForNotes, choose, transitionCost } from '../src/engine/optimize';
import { parse } from '../src/engine/parse';
import { DADGAD, pitchClass, pitchesOf } from '../src/engine/tuning';
import { fretSpan, generateVoicings, voicingsFor } from '../src/engine/voicings';
import library from '../src/data/dadgad-chords.json';
import overrides from '../src/data/overrides.json';

// Original exercise riffs (not from any song).
const RIFF = `
e|-----------0-----|-----------------|
B|-------1-------1-|-----3h5---3-----|
G|-----2---2-------|---2-------2-----|
D|---2-------------|-0-----------0---|
A|-3---------------|-----------------|
E|-----------------|-----------------|
`;

const CHORDS = `
[Verse]
G        C        D        Em
la la la la la la la la la la
G        C        D        G
la la la la la la la la la la
`;

const sourcePitches = (text: string) => {
  const out: number[][] = [];
  for (const s of parse(text)) if (s.kind === 'tab') for (const e of s.block.events) out.push(e.notes.map((n) => n.pitch).sort((a, b) => a - b));
  return out;
};

describe('parse', () => {
  it('reads tab events with multi-digit frets and techniques', () => {
    const secs = parse(RIFF);
    const tab = secs.find((s) => s.kind === 'tab')!;
    expect(tab.kind).toBe('tab');
    if (tab.kind !== 'tab') return;
    expect(tab.block.events).toHaveLength(13); // 3h5 is two events
    expect(tab.block.events[0].notes).toEqual([{ string: 1, fret: 3, pitch: 48 }]); // C3 on A string
    expect(tab.block.gaps.flat().join('')).toContain('h');

    const wide = parse('e|--12--|\nB|------|\nG|------|\nD|------|\nA|------|\nE|--10--|');
    const block = wide.find((s) => s.kind === 'tab');
    if (block?.kind !== 'tab') throw new Error('no block');
    expect(block.block.events).toHaveLength(1);
    expect(block.block.events[0].notes.map((n) => n.fret).sort()).toEqual([10, 12]);
  });

  it('detects chord lines and leaves lyrics alone', () => {
    const secs = parse(CHORDS);
    expect(secs.filter((s) => s.kind === 'chords')).toHaveLength(2);
    expect(secs.some((s) => s.kind === 'text' && s.line.startsWith('la la'))).toBe(true);
    expect(secs.some((s) => s.kind === 'text' && s.line === '[Verse]')).toBe(true);
  });
});

describe('chords', () => {
  it('parses names and aliases', () => {
    expect(parseChord('Bbmaj7')).toEqual({ root: 10, quality: 'maj7', bass: 10 });
    expect(parseChord('D/F#')).toEqual({ root: 2, quality: '', bass: 6 });
    expect(parseChord('Amin')?.quality).toBe('m');
    expect(parseChord('Hello')).toBeNull();
  });

  it('identifies chords from pitches', () => {
    expect(identifyChord([43, 47, 50, 55, 59, 67])).toEqual({ root: 7, quality: '', bass: 7 }); // open G
    expect(identifyChord([40, 47, 52, 55, 59, 64])?.quality).toBe('m'); // Em
  });
});

describe('faithful mode', () => {
  it('keeps every pitch and stays within a 4-fret span', () => {
    const src = sourcePitches(RIFF);
    const slots = src.map((p) => candidatesForNotes(p, 'faithful'));
    const picks = choose(slots);
    picks.forEach((p, i) => {
      const frets = slots[i][p].frets;
      expect(pitchesOf(frets).sort((a, b) => a - b)).toEqual([...new Set(src[i])]);
      expect(fretSpan(frets)).toBeLessThanOrEqual(3);
    });
  });

  it('renders a 6-line DADGAD block that keeps bar lines and techniques', () => {
    const { text } = convert(RIFF, 'faithful');
    const lines = text.split('\n').filter((l) => /^[DAG]\|/.test(l));
    expect(lines.map((l) => l[0])).toEqual(['D', 'A', 'G', 'D', 'A', 'D']);
    expect(lines.every((l) => l.split('|').length === lines[0].split('|').length)).toBe(true);
    expect(text).toContain('h');
  });
});

describe('chord library', () => {
  const lib = library as Record<string, { frets: (number | null)[] }[]>;

  it('covers common chords with several positions', () => {
    for (const name of ['G', 'C', 'Em', 'D', 'Am', 'F']) {
      expect(lib[name]?.length ?? 0, name).toBeGreaterThanOrEqual(3);
    }
  });

  it('every saved voicing contains its chord tones, right bass, span <= 3', () => {
    const all = { ...lib, ...Object.fromEntries(Object.entries(overrides as Record<string, (number | null)[][]>).map(([k, v]) => [k, v.map((frets) => ({ frets }))])) };
    for (const [name, voicings] of Object.entries(all)) {
      const chord = parseChord(name)!;
      expect(chord, name).not.toBeNull();
      const tones = chordPCs(chord);
      for (const { frets } of voicings) {
        const pcs = new Set(pitchesOf(frets).map(pitchClass));
        tones.forEach((t) => {
          if (t !== pitchClass(chord.root + 7)) expect(pcs.has(t), `${name} ${frets}`).toBe(true);
        });
        const lowest = frets.findIndex((f) => f !== null);
        expect(pitchClass(DADGAD[lowest] + frets[lowest]!), `${name} bass`).toBe(chord.bass);
        expect(fretSpan(frets), name).toBeLessThanOrEqual(3);
      }
    }
  });

  it('generates slash chords on demand', () => {
    const v = generateVoicings(parseChord('D/F#')!);
    expect(v.length).toBeGreaterThan(0);
  });
});

describe('idiomatic mode', () => {
  it('chooses chord shapes that travel less than always taking the easiest shape', () => {
    const prog = ['G', 'C', 'D', 'Em', 'Am', 'C', 'G'].map((n) => voicingsFor(parseChord(n)!));
    const slots = prog.map((vs) => vs.map((v) => ({ frets: v.frets, cost: v.difficulty, revoiced: false })));
    const total = (picks: number[]) =>
      picks.reduce((sum, p, i) => sum + slots[i][p].cost + (i ? transitionCost(slots[i - 1][picks[i - 1]].frets, slots[i][p].frets) : 0), 0);
    const best = choose(slots);
    expect(total(best)).toBeLessThanOrEqual(total(slots.map(() => 0)));
  });

  it('labels chord shapes in a chord sheet', () => {
    const { text, chords } = convert(CHORDS, 'idiomatic');
    expect(chords.map((c) => c.label.replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, ''))).toEqual(expect.arrayContaining(['G', 'C', 'D', 'Em']));
    expect(text).toContain('la la la');
  });

  it('may re-voice a standard open G chord into a DADGAD shape', () => {
    const openG = '\ne|-3-|\nB|-0-|\nG|-0-|\nD|-0-|\nA|-2-|\nE|-3-|\n';
    const { text } = convert(openG, 'idiomatic');
    expect(text.split('\n').filter((l) => /^[DAG]\|/.test(l))).toHaveLength(6);
  });
});
