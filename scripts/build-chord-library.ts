// Precompute DADGAD voicings for every root x quality and save them to src/data/dadgad-chords.json.
// Run once with `npm run chords` (re-run only if the scoring in voicings.ts changes).
import { writeFileSync } from 'node:fs';
import { QUALITIES, chordName } from '../src/engine/chords';
import { generateVoicings } from '../src/engine/voicings';

const round = (n: number) => Math.round(n * 100) / 100;
const lib: Record<string, { frets: (number | null)[]; difficulty: number }[]> = {};

for (let root = 0; root < 12; root++) {
  for (const quality of Object.keys(QUALITIES)) {
    const chord = { root, quality, bass: root };
    const voicings = generateVoicings(chord);
    if (voicings.length) lib[chordName(chord)] = voicings.map((v) => ({ frets: v.frets, difficulty: round(v.difficulty) }));
    else console.warn(`no voicing for ${chordName(chord)}`);
  }
}

// One voicing per line keeps the file readable and diff-friendly.
const body = Object.entries(lib)
  .map(([name, vs]) => `  ${JSON.stringify(name)}: [\n${vs.map((v) => `    ${JSON.stringify(v)}`).join(',\n')}\n  ]`)
  .join(',\n');
writeFileSync(new URL('../src/data/dadgad-chords.json', import.meta.url), `{\n${body}\n}\n`);
console.log(`saved ${Object.keys(lib).length} chords`);
