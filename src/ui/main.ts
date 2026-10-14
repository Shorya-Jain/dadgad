import { convert } from '../engine/convert';
import { detectSource } from '../engine/detect';
import { CAPO_RANGE, KEY_RANGE, KeyOptions } from '../engine/key';
import type { Mode } from '../engine/optimize';
import { Source, parseTuning, tuningName } from '../engine/tuning';
import { diagram } from './diagram';

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
