import { Chord, QUALITIES, SHARP_NAMES, chordName, parseChord } from '../engine/chords';
import { pitchClass } from '../engine/tuning';
import { position, voicingsFor } from '../engine/voicings';
import { diagram } from './diagram';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const QUALITY_LABELS: Record<string, string> = {
  '': 'Major', m: 'Minor', '5': 'Power chord (5)', '7': 'Dominant 7', m7: 'Minor 7', maj7: 'Major 7',
  sus2: 'Sus2', sus4: 'Sus4', '7sus4': '7sus4', add9: 'Add9', madd9: 'Minor add9', '6': '6', m6: 'Minor 6',
  '9': '9', m9: 'Minor 9', maj9: 'Major 9', dim: 'Diminished', dim7: 'Diminished 7',
  m7b5: 'Half-diminished (m7b5)', aug: 'Augmented',
};
// Explicit order: JS lists number-like keys ("5", "7") before others, which would put D5 before D.
const QUALITY_ORDER = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', '7sus4', 'add9', 'madd9', '5', '6', 'm6', '9', 'm9', 'maj9', 'dim', 'dim7', 'm7b5', 'aug'];
const ROOT_LABELS =['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];

// ---- Controls ----
const search = $<HTMLInputElement>('search');
const qualitySelect = $<HTMLSelectElement>('quality');
const rootsEl = $('roots');
let root: number | null = 2; // start on D: home key for DADGAD

qualitySelect.replaceChildren(
  Object.assign(document.createElement('option'), { value: 'all', textContent: 'All chord types' }),
  ...QUALITY_ORDER.map((q) => Object.assign(document.createElement('option'), { value: q, textContent: QUALITY_LABELS[q] ?? q })),
);

const rootButtons = [null, ...ROOT_LABELS.map((_, i) => i)].map((r) => {
  const b = Object.assign(document.createElement('button'), { textContent: r === null ? 'All' : ROOT_LABELS[r], className: 'string-btn' });
  b.addEventListener('click', () => {
    root = r;
    search.value = '';
    render();
  });
  rootsEl.append(b);
  return { b, r };
});

search.addEventListener('input', render);
qualitySelect.addEventListener('change', render);

// ---- Cards ----
function card(chord: Chord, title: string): HTMLElement {
  const notes = [...new Set([chord.bass, ...QUALITIES[chord.quality].map((i) => pitchClass(chord.root + i))])]
    .map((pc) => SHARP_NAMES[pc])
    .join(' ');
  const shapes = voicingsFor(chord).map((v) => {
    const pos = position(v.frets);
    return diagram({ label: pos === 0 ? 'Open' : `Fret ${pos}`, frets: v.frets });
  });
  const el = document.createElement('section');
  el.className = 'chord-card';
  const head = document.createElement('div');
  head.className = 'chord-head';
  head.append(
    Object.assign(document.createElement('h2'), { textContent: title }),
    Object.assign(document.createElement('span'), { textContent: `${QUALITY_LABELS[chord.quality] ?? chord.quality} · ${notes}` }),
  );
  const row = document.createElement('div');
  row.className = 'diagrams';
  row.append(...(shapes.length ? shapes : [Object.assign(document.createElement('p'), { textContent: 'No playable shape found.' })]));
  el.append(head, row);
  return el;
}

function render() {
  const list = $('list');
  const q = search.value.trim();
  rootButtons.forEach(({ b, r }) => b.classList.toggle('active', !q && r === root));

  // A typed chord name shows just that chord (including slash chords not in the saved library).
  if (q) {
    const chord = parseChord(q);
    list.replaceChildren(
      chord ? card(chord, q) : Object.assign(document.createElement('p'), { className: 'status', textContent: `"${q}" isn't a chord name I recognise.` }),
    );
    return;
  }

  const quality = qualitySelect.value;
  const roots = root === null ? SHARP_NAMES.map((_, i) => i) : [root];
  const qualities = quality === 'all' ? QUALITY_ORDER : [quality];
  const cards: HTMLElement[] = [];
  for (const r of roots) for (const ql of qualities) {
    const chord = { root: r, quality: ql, bass: r };
    cards.push(card(chord, chordName(chord)));
  }
  list.replaceChildren(...cards);
}

render();
