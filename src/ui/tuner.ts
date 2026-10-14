import { STRINGS, centsBetween, detectPitch, nearestString, noteName } from '../tuner/pitch';
import { el } from './diagram';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- Gauge: an arc from one semitone flat (left) to one semitone sharp (right) ----
const CX = 200, CY = 255, R = 190;
const SPAN = 60; // degrees either side of vertical
const IN_TUNE = 5; // cents
const CLOSE = 20; // cents

const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const point = (deg: number, r: number) => [CX + r * Math.cos(toRad(deg)), CY + r * Math.sin(toRad(deg))];
const centsToDeg = (cents: number) => (Math.max(-100, Math.min(100, cents)) / 100) * SPAN;

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = point(fromDeg, r), [x2, y2] = point(toDeg, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}

const gauge = $('gauge') as unknown as SVGSVGElement;
const zone = (cents: number, cls: string) =>
  el('path', { d: arcPath(centsToDeg(-cents), centsToDeg(cents), R - 22), class: cls, fill: 'none', 'stroke-width': 26 });
gauge.append(
  zone(CLOSE, 'zone-close'),
  zone(IN_TUNE, 'zone-good'),
  el('path', { d: arcPath(-SPAN, SPAN, R - 8), class: 'gauge-line', fill: 'none', 'stroke-width': 3 }),
);
// End ticks and labels for the neighbouring semitones.
for (const side of [-1, 1]) {
  const [x1, y1] = point(side * SPAN, R - 8), [x2, y2] = point(side * SPAN, R - 34);
  gauge.append(el('line', { x1, y1, x2, y2, class: 'gauge-line', 'stroke-width': 3 }));
}
const [lx, ly] = point(-SPAN + 8, R - 70), [rx, ry] = point(SPAN - 8, R - 70);
const flatLabel = el('text', { x: lx, y: ly, class: 'gauge-label', 'text-anchor': 'middle' });
const sharpLabel = el('text', { x: rx, y: ry, class: 'gauge-label', 'text-anchor': 'middle' });
const targetLabel = el('text', { x: CX, y: CY - R + 75, class: 'gauge-target', 'text-anchor': 'middle' });
const needle = el('g', { class: 'needle' });
needle.append(
  el('polygon', { points: `${CX - 4},${CY} ${CX + 4},${CY} ${CX + 1},${CY - R + 12} ${CX - 1},${CY - R + 12}`, class: 'needle-body' }),
);
const hub = el('circle', { cx: CX, cy: CY, r: 14, class: 'hub' });
gauge.append(flatLabel, sharpLabel, targetLabel, needle, hub);

function showTarget(midi: number) {
  targetLabel.textContent = noteName(midi);
  flatLabel.textContent = noteName(midi - 1);
  sharpLabel.textContent = noteName(midi + 1);
}

function setNeedle(cents: number | null) {
  const deg = cents === null ? 0 : centsToDeg(cents);
  needle.setAttribute('transform', `rotate(${deg} ${CX} ${CY})`);
  needle.classList.toggle('idle', cents === null);
  const state = cents === null ? '' : Math.abs(cents) <= IN_TUNE ? 'good' : Math.abs(cents) <= CLOSE ? 'close' : 'off';
  gauge.dataset.state = state;
}

// ---- String picker: Auto, or lock to one string ----
let locked: number | null = null; // string index, or null for auto
const stringsEl = $('strings');
const buttons = ['Auto', ...STRINGS.map((m, i) => `${6 - i} · ${noteName(m)}`)].map((label, i) => {
  const b = Object.assign(document.createElement('button'), { textContent: label, className: 'string-btn' });
  b.addEventListener('click', () => {
    locked = i === 0 ? null : i - 1;
    if (locked !== null) showTarget(STRINGS[locked]);
    highlight(locked);
  });
  stringsEl.append(b);
  return b;
});
function highlight(stringIdx: number | null, detected = false) {
  buttons.forEach((b, i) => {
    b.classList.toggle('active', locked === null ? i === 0 : i === locked + 1);
    b.classList.toggle('detected', detected && stringIdx !== null && i === stringIdx + 1);
  });
}
highlight(null);
showTarget(STRINGS[0]);
setNeedle(null);

// ---- Microphone loop ----
const reading = $('reading');
const micStatus = $<HTMLParagraphElement>('mic-status');
const startBtn = $<HTMLButtonElement>('start-btn');
let stop: (() => void) | null = null;

const recent: number[] = []; // last few readings, smoothed with a median
let lastHeard = 0;

function update(freq: number | null) {
  const now = performance.now();
  if (freq === null) {
    if (now - lastHeard > 400) {
      recent.length = 0;
      setNeedle(null);
      reading.textContent = 'Listening… play one string';
      highlight(locked);
    }
    return;
  }
  lastHeard = now;
  recent.push(freq);
  if (recent.length > 5) recent.shift();
  const f = [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)];

  const string = locked ?? nearestString(f).string;
  const target = STRINGS[string];
  const cents = centsBetween(f, target);
  showTarget(target);
  setNeedle(cents);
  highlight(string, locked === null);
  const c = Math.round(cents);
  reading.textContent =
    Math.abs(cents) <= IN_TUNE
      ? `${noteName(target)} · in tune ✓`
      : `${noteName(target)} · ${c > 0 ? '+' : ''}${c} cents · tune ${cents > 0 ? 'down' : 'up'}`;
}

async function start() {
  micStatus.hidden = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new AudioContext();
    void ctx.resume(); // some browsers start it paused (e.g. after the permission prompt); don't block on it
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      update(detectPitch(buf, ctx.sampleRate));
      raf = requestAnimationFrame(loop);
    };
    loop();
    reading.textContent = 'Listening… play one string';
    startBtn.textContent = 'Stop tuner';
    stop = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      setNeedle(null);
      reading.textContent = 'Press Start and play a string';
      startBtn.textContent = 'Start tuner';
      stop = null;
    };
  } catch (e) {
    micStatus.hidden = false;
    micStatus.classList.add('error');
    micStatus.textContent =
      (e as Error).name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser’s site settings, then try again.'
        : `Couldn't start the microphone (${(e as Error).message}).`;
  }
}

startBtn.addEventListener('click', () => (stop ? stop() : start()));
