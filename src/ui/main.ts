import { ChordShape, convert } from '../engine/convert';
import { detectSource } from '../engine/detect';
import { CAPO_RANGE, KEY_RANGE, KeyOptions } from '../engine/key';
import type { Mode } from '../engine/optimize';
import { DADGAD_LABELS, Source, parseTuning, tuningName } from '../engine/tuning';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>('input');
const status = $<HTMLParagraphElement>('status');

function setStatus(msg: string, error = false) {
  status.hidden = !msg;
  status.textContent = msg;
  status.classList.toggle('error', error);
}

$('search-btn').addEventListener('click', () => {
  const q = $<HTMLInputElement>('search').value.trim();
  if (!q) return;
  const url = `https://www.google.com/search?q=${encodeURIComponent(`${q} tab site:ultimate-guitar.com`)}`;
  window.open(url, '_blank', 'noopener');
  setStatus('Copy the tab page URL from the search results into the box below.');
});

$('fetch-btn').addEventListener('click', async () => {
  const url = $<HTMLInputElement>('url').value.trim();
  if (!url) return;
  const btn = $<HTMLButtonElement>('fetch-btn');
  btn.disabled = true;
  setStatus('Fetching…');
  try {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
    const data = (await res.json()) as { text?: string; title?: string; error?: string };
    if (!res.ok || !data.text) throw new Error(data.error ?? `HTTP ${res.status}`);
    input.value = data.text;
    songTitle = data.title ?? '';
    setStatus('');
    detect();
    run();
  } catch (e) {
    setStatus(`Couldn't fetch that page (${(e as Error).message}). Open it, copy the tab, and paste it below.`, true);
  } finally {
    btn.disabled = false;
  }
});

$('convert-btn').addEventListener('click', run);
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => input.value && run()));
// New tab text: forget the old title and re-detect its tuning/capo.
input.addEventListener('input', () => {
  songTitle = '';
  detect();
});
['src-tuning', 'src-capo', 'src-skip-low', 'key-amount'].forEach((id) => $(id).addEventListener('change', () => input.value && run()));

const keyAmount = $<HTMLSelectElement>('key-amount');
const keyCapo = $<HTMLInputElement>('key-capo');

/** Options depend on the mode: semitone shifts, or capo frets that keep the original key. */
function fillKeyOptions() {
  const capo = keyCapo.checked;
  const opts: [string, string][] = [['auto', 'Auto (best for DADGAD)']];
  if (capo) for (const c of CAPO_RANGE) opts.push([String(c), c === 0 ? 'No capo' : `Capo ${c}`]);
  else for (const s of KEY_RANGE) opts.push([String(s), s === 0 ? 'Original key' : `${s > 0 ? '+' : '−'}${Math.abs(s)} semitone${Math.abs(s) > 1 ? 's' : ''}`]);
  keyAmount.replaceChildren(...opts.map(([value, label]) => Object.assign(document.createElement('option'), { value, textContent: label })));
}
fillKeyOptions();
keyCapo.addEventListener('change', () => {
  fillKeyOptions();
  if (input.value) run();
});

function readKey(): KeyOptions {
  return { kind: keyCapo.checked ? 'capo' : 'key', amount: keyAmount.value === 'auto' ? 'auto' : Number(keyAmount.value) };
}

$('copy-btn').addEventListener('click', () => navigator.clipboard.writeText($('output').textContent ?? ''));

let songTitle = '';
const tuningInput = $<HTMLInputElement>('src-tuning');
const capoInput = $<HTMLInputElement>('src-capo');
const skipLowInput = $<HTMLInputElement>('src-skip-low');

/** Fill the tuning/capo fields from what the tab says about itself. */
function detect() {
  const { source, found, unsure } = detectSource(input.value);
  tuningInput.value = tuningName(source.tuning);
  capoInput.value = String(source.capo);
  skipLowInput.checked = source.capoSkipsLow;
  const note = $<HTMLParagraphElement>('detected');
  note.classList.toggle('warn', unsure);
  if (unsure) note.textContent = "This tab mentions a tuning I couldn't read. Set the tab's tuning above before converting.";
  else if (found.length) note.textContent = `Read from the tab: ${found.join(', ')}. Check these before converting.`;
  note.hidden = !unsure && found.length === 0;
}

function readSource(): Source | null {
  const tuning = parseTuning(tuningInput.value);
  tuningInput.classList.toggle('invalid', !tuning);
  if (!tuning) return null;
  const capo = Math.max(0, Math.min(12, Number(capoInput.value) || 0));
  return { tuning, capo, capoSkipsLow: skipLowInput.checked };
}

function run() {
  const source = readSource();
  if (!source) {
    setStatus("The tab's tuning needs six note names, e.g. E A D G B E.", true);
    return;
  }
  setStatus('');
  const mode = (document.querySelector('input[name="mode"]:checked') as HTMLInputElement).value as Mode;
  const requested = readKey();
  const { text, chords, key } = convert(input.value, mode, source, requested);
  const keyNote = $<HTMLParagraphElement>('key-note');
  keyNote.hidden = requested.amount !== 'auto';
  keyNote.textContent =
    key.amount === 0
      ? 'Auto: the original key already suits DADGAD.'
      : key.kind === 'capo'
        ? `Auto chose capo ${key.amount}.`
        : `Auto chose ${key.amount > 0 ? 'up' : 'down'} ${Math.abs(key.amount)} semitone${Math.abs(key.amount) > 1 ? 's' : ''}.`;
  $('song-title').textContent = songTitle || 'DADGAD';
  $('output').textContent = text;
  $('diagrams').replaceChildren(...chords.map(diagram));
  $('result').hidden = false;
}

// ---- Chord diagram (SVG): strings left = low D, right = high D ----
const SVG = 'http://www.w3.org/2000/svg';
function el(tag: string, attrs: Record<string, string | number>, text?: string) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
}

function diagram({ label, frets }: ChordShape): HTMLElement {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const lo = fretted.length ? Math.min(...fretted) : 1;
  const hi = fretted.length ? Math.max(...fretted) : 1;
  const start = hi <= 4 ? 1 : lo; // first fret shown
  const rows = 4, gap = 16, top = 30, left = 18;
  const w = left * 2 + gap * 5, h = top + gap * rows + 22;
  const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, fill: 'currentColor', stroke: 'currentColor' });

  for (let s = 0; s < 6; s++) svg.append(el('line', { x1: left + s * gap, y1: top, x2: left + s * gap, y2: top + rows * gap, 'stroke-width': 1 }));
  for (let r = 0; r <= rows; r++) svg.append(el('line', { x1: left, y1: top + r * gap, x2: left + 5 * gap, y2: top + r * gap, 'stroke-width': r === 0 && start === 1 ? 3 : 1 }));
  if (start > 1) svg.append(el('text', { x: 2, y: top + gap * 0.7, 'font-size': 10, stroke: 'none' }, `${start}`));

  frets.forEach((f, s) => {
    const x = left + s * gap;
    if (f === null) svg.append(el('text', { x, y: top - 8, 'font-size': 11, 'text-anchor': 'middle', stroke: 'none' }, '×'));
    else if (f === 0) svg.append(el('circle', { cx: x, cy: top - 12, r: 4, fill: 'none', 'stroke-width': 1.2 }));
    else if (f - start < rows) svg.append(el('circle', { cx: x, cy: top + (f - start + 0.5) * gap, r: 5.5, stroke: 'none' }));
    // Frets outside the 4-fret window (a high note over open strings) are labelled instead.
    else svg.append(el('text', { x, y: top + rows * gap + 12, 'font-size': 9, 'text-anchor': 'middle', stroke: 'none' }, `${f}`));
    svg.append(el('text', { x, y: h - 2, 'font-size': 9, 'text-anchor': 'middle', stroke: 'none', opacity: 0.6 }, DADGAD_LABELS[s]));
  });

  const wrap = document.createElement('div');
  wrap.className = 'diagram';
  wrap.append(svg, Object.assign(document.createElement('div'), { textContent: label }));
  return wrap;
}
