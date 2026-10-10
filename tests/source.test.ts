import { describe, expect, it } from 'vitest';
import { cleanSections, convert } from '../src/engine/convert';
import { detectSource } from '../src/engine/detect';
import { candidatesForNotes } from '../src/engine/optimize';
import { parse } from '../src/engine/parse';
import { STANDARD, parseTuning, pitchesOf, sourcePitch, tuningName } from '../src/engine/tuning';

// All fixture text below is original, written for these tests.

describe('parseTuning', () => {
  it('reads common spellings with sensible octaves', () => {
    expect(parseTuning('E A D G B E')).toEqual(STANDARD);
    expect(parseTuning('EADGbe')).toEqual(STANDARD); // lowercase b is the B string here
    expect(parseTuning('DADGAD')).toEqual([38, 45, 50, 55, 57, 62]);
    expect(parseTuning('Eb Ab Db Gb Bb Eb')).toEqual(STANDARD.map((p) => p - 1));
    expect(parseTuning('D A C A G d')).toEqual([38, 45, 48, 57, 55, 62]);
    expect(parseTuning('D A D')).toBeNull();
    expect(tuningName([38, 45, 48, 57, 55, 62])).toBe('D A C A G D');
  });
});

describe('partial capo', () => {
  it('leaves the low string uncapoed', () => {
    const src = { tuning: STANDARD, capo: 9, capoSkipsLow: true };
    expect(sourcePitch(src, 0, 2)).toBe(42);
    expect(sourcePitch(src, 1, 2)).toBe(45 + 9 + 2);
  });
});

describe('detectSource', () => {
  it('reads tuning, capo and partial capo from the notes', () => {
    const text = [
      'My Tune - Some Band',
      'Tuning:',
      '',
      'It is a custom tuning:',
      'D A C A G d',
      '',
      'Put a capo at the 9th fret. The capo covers only five strings; leave the low string open.',
      '',
      '[Intro]',
    ].join('\n');
    const d = detectSource(text);
    expect(d.source).toEqual({ tuning: [38, 45, 48, 57, 55, 62], capo: 9, capoSkipsLow: true });
    expect(d.unsure).toBe(false);
  });

  it('reads the tuning from string names on the tab lines', () => {
    const tab = 'D|--0--|\nA|--0--|\nG|--0--|\nD|--0--|\nA|--0--|\nD|--0--|';
    expect(detectSource(tab).source.tuning).toEqual([38, 45, 50, 55, 57, 62]);
  });

  it('flags a tuning it cannot read', () => {
    const d = detectSource('Tuning: something unusual, see video\n\n[Verse]');
    expect(d.unsure).toBe(true);
    expect(d.source.tuning).toEqual(STANDARD);
  });

  it('defaults to standard with no capo', () => {
    const d = detectSource('[Verse]\nG   C\nla la');
    expect(d.source).toEqual({ tuning: STANDARD, capo: 0, capoSkipsLow: false });
    expect(d.found).toEqual([]);
  });
});

describe('converting from another tuning', () => {
  it('keeps the real pitches of an open-D-style tab', () => {
    const source = { tuning: [38, 45, 50, 54, 57, 62], capo: 2, capoSkipsLow: false }; // D A D F# A D
    const tab = 'D|-----0-|\nA|---0---|\nF|-2-----|\nD|-------|\nA|-------|\nD|-0-----|';
    const blocks = parse(tab, source).filter((s) => s.kind === 'tab');
    const expected = blocks.flatMap((b) => (b.kind === 'tab' ? b.block.events.map((e) => e.notes.map((n) => n.pitch)) : []));
    expect(expected[0].sort()).toEqual([38 + 2, 54 + 2 + 2].sort()); // capo raises every string
    const { text } = convert(tab, 'faithful', source);
    expect(text).toContain('Converted from: D A D F# A D, capo 2');
  });

  it('octave-shifts notes too high for DADGAD instead of dropping them', () => {
    const tooHigh = [62 + 15 + 3]; // above the top D string's 15th fret
    const cands = candidatesForNotes(tooHigh, 'faithful');
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0].revoiced).toBe(true);
    expect(pitchesOf(cands[0].frets)).toEqual([tooHigh[0] - 12]);
  });
});

describe('cleanSections', () => {
  it('drops the preamble, separators and tuning/author notes but keeps the music', () => {
    const text = [
      '----------------',
      '   My Tune - Some Band',
      '----------------',
      'Tabbed by: someone',
      '',
      'Intro chat about the song.',
      '',
      '[Verse]',
      'G        C',
      'la la la la',
      '',
      '',
      'Note: play this part softly',
      'and let it ring.',
      '',
      '[Chorus]',
      'e|--0--|\nB|--0--|\nG|--0--|\nD|--0--|\nA|--0--|\nE|--0--|',
    ].join('\n');
    const kept = cleanSections(parse(text)).map((s) => (s.kind === 'text' ? s.line : s.kind));
    expect(kept).toEqual(['[Verse]', 'chords', 'la la la la', '', '[Chorus]', 'tab']);
  });

  it('keeps everything when there is no preamble', () => {
    const text = 'G   C\nla la';
    expect(cleanSections(parse(text)).length).toBe(2);
  });
});
