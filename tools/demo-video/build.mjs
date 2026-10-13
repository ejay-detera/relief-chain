// Renders video.html into an MP4 with voice-over, sound effects, and music.
//
// Pipeline:
//   1. vo.ps1 synthesizes one WAV per scene (offline Windows speech engine).
//   2. Scene durations are derived from the voice-over lengths.
//   3. Playwright (installed Microsoft Edge) renders video.html frame by frame
//      at a fixed timestamp, so animation is deterministic, not real-time.
//   4. SFX + music are synthesized in Node and mixed with the voice-over.
//   5. ffmpeg encodes the JPEG frame stream + the mixed WAV into H.264/AAC.
//
// Usage:
//   node build.mjs                 full render  -> out/relief-chain-demo.mp4
//   node build.mjs --stills 2,40   PNG stills at those seconds -> out/stills/
import ffmpegPath from 'ffmpeg-static';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { hasElevenLabs, synthesizeElevenLabs } from './vo-elevenlabs.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(ROOT, 'build');
const OUT = path.join(ROOT, 'out');
const FPS = 30;
const W = 1920;
const H = 1080;
const SR = 48000;
const MAX_TOTAL = 295; // keep the video under 5:00
const LEAD = 0.6; // silence before VO in each scene
const TAIL = 1.0; // breathing room after VO
const CPS = 22; // must match video.html

const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;

fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const scenes = JSON.parse(fs.readFileSync(path.join(ROOT, 'scenes.json'), 'utf8'));

// ---------------------------------------------------------------- voice-over
const makeVo = (rate) => {
  execFileSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'vo.ps1'),
      '-Json', path.join(ROOT, 'scenes.json'), '-Out', path.join(BUILD, 'vo'), '-Rate', String(rate)],
    { stdio: 'inherit' },
  );
};

const decode = (file) => {
  const out = execFileSync(ffmpegPath, ['-v', 'error', '-i', file, '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  const copy = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return new Float32Array(copy);
};

const useEleven = hasElevenLabs() && !args.includes('--sapi');
let rate = 0;
let vo = {};
let timeline = [];
let total = 0;
for (;;) {
  vo = {};
  if (useEleven) {
    console.log('Synthesizing voice-over (ElevenLabs)...');
    const files = await synthesizeElevenLabs(scenes, path.join(BUILD, 'vo-eleven'));
    for (const [id, file] of Object.entries(files)) vo[id] = decode(file);
  } else {
    console.log(`Synthesizing voice-over (Windows speech, rate ${rate})...`);
    makeVo(rate);
    for (const s of scenes) if (s.vo) vo[s.id] = decode(path.join(BUILD, 'vo', `${s.id}.wav`));
  }
  timeline = [];
  let t = 0;
  for (const s of scenes) {
    const voDur = vo[s.id] ? vo[s.id].length / SR : 0;
    const dur = s.dur ?? LEAD + voDur + TAIL + (s.extra ?? 0);
    timeline.push({ id: s.id, start: t, dur, voStart: t + LEAD, voDur, text: s.vo ?? '' });
    t += dur;
  }
  total = t;
  if (useEleven || total <= MAX_TOTAL || rate >= 4) break;
  rate += 1;
}
console.log(`Timeline: ${timeline.length} scenes, ${total.toFixed(1)}s total`);
for (const e of timeline) console.log(`  ${e.id.padEnd(4)} start ${e.start.toFixed(1).padStart(6)}s  dur ${e.dur.toFixed(1)}s`);
if (total > MAX_TOTAL) throw new Error(`Video is ${total.toFixed(1)}s, over the ${MAX_TOTAL}s limit.`);

// ---------------------------------------------------------------- browser
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(ROOT, 'video.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const setup = await page.evaluate((tl) => window.__setup(tl), timeline);
if (setup.scenes !== timeline.length) throw new Error(`video.html has ${setup.scenes} scenes, scenes.json has ${timeline.length}.`);

if (stillsArg) {
  const dir = path.join(OUT, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const sec of stillsArg.split(',').map(Number)) {
    await page.evaluate((t) => window.__render(t), sec);
    const file = path.join(dir, `still-${String(sec).padStart(3, '0')}s.png`);
    await page.screenshot({ path: file });
    console.log(`Still: ${file}`);
  }
  await browser.close();
  process.exit(0);
}

const cues = await page.evaluate(() => window.__cues());
console.log(`SFX cues: ${cues.length}`);

// ---------------------------------------------------------------- audio synth
const N = Math.ceil(total * SR) + SR;
const sfx = new Float32Array(N);
const music = new Float32Array(N);
const voice = new Float32Array(N);

let seed = 99991;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const tone = (buf, t0, { f = 1000, f2 = null, dur = 0.1, amp = 0.3, decay = 20, type = 'sine', attack = 0.002 }) => {
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / SR;
    const fr = f2 ? f * Math.pow(f2 / f, i / n) : f;
    ph += (2 * Math.PI * fr) / SR;
    const s = Math.sin(ph);
    const v = type === 'square' ? Math.sign(s) * 0.5 : type === 'tri' ? (2 / Math.PI) * Math.asin(s) : s;
    const env = Math.min(1, tt / attack) * Math.exp(-decay * tt) * Math.min(1, (n - i) / (0.004 * SR));
    const k = s0 + i;
    if (k >= 0 && k < buf.length) buf[k] += v * env * amp;
  }
};

const noise = (buf, t0, { dur = 0.5, amp = 0.3, lo = 300, hi = 5000 }) => {
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(dur * SR);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fc = lo + (hi - lo) * Math.sin(Math.PI * u);
    const alpha = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += alpha * (rnd() * 2 - 1 - y);
    const env = Math.pow(Math.sin(Math.PI * u), 2);
    const k = s0 + i;
    if (k >= 0 && k < buf.length) buf[k] += y * env * amp;
  }
};

const SFX = {
  whoosh: (t) => noise(sfx, t - 0.22, { dur: 0.55, amp: 0.55, lo: 250, hi: 4200 }),
  tap: (t) => { tone(sfx, t, { f: 1700, dur: 0.05, decay: 90, amp: 0.22 }); tone(sfx, t, { f: 600, dur: 0.05, decay: 110, amp: 0.15 }); },
  pop: (t) => tone(sfx, t, { f: 380, f2: 950, dur: 0.1, decay: 28, amp: 0.26 }),
  tick: (t) => tone(sfx, t, { f: 2600, dur: 0.03, decay: 180, amp: 0.09 }),
  type: (t, span) => {
    for (let k = t; k < t + span; k += (1 / CPS) * (0.7 + rnd() * 0.6)) {
      tone(sfx, k, { f: 1600 + rnd() * 700, dur: 0.02, decay: 260, amp: 0.06 });
      noise(sfx, k, { dur: 0.012, amp: 0.05, lo: 3000, hi: 6000 });
    }
  },
  success: (t) => {
    tone(sfx, t, { f: 880, dur: 0.3, decay: 9, amp: 0.15, type: 'tri' });
    tone(sfx, t + 0.11, { f: 1318.5, dur: 0.5, decay: 6, amp: 0.15, type: 'tri' });
  },
  ding: (t) => {
    tone(sfx, t, { f: 1568, dur: 1.1, decay: 4, amp: 0.14 });
    tone(sfx, t, { f: 2093, dur: 0.9, decay: 5, amp: 0.08 });
    tone(sfx, t + 0.12, { f: 2349, dur: 0.8, decay: 5, amp: 0.08 });
  },
  toggle: (t) => { tone(sfx, t, { f: 900, dur: 0.03, decay: 150, amp: 0.2 }); tone(sfx, t + 0.05, { f: 1300, dur: 0.03, decay: 150, amp: 0.18 }); },
  beep: (t) => tone(sfx, t, { f: 1250, dur: 0.12, decay: 6, amp: 0.09, type: 'square', attack: 0.004 }),
  count: (t, span) => {
    const steps = Math.max(4, Math.floor(span / 0.05));
    for (let i = 0; i < steps; i++) tone(sfx, t + (span * i) / steps, { f: 1500 + (1100 * i) / steps, dur: 0.02, decay: 220, amp: 0.045 });
  },
  batch: (t, span, n) => { for (let i = 0; i < n; i++) tone(sfx, t + (span * i) / n, { f: i % 2 ? 2200 : 1900, dur: 0.025, decay: 200, amp: 0.05 }); },
  transfer: (t, span) => {
    tone(sfx, t, { f: 300, f2: 1400, dur: Math.max(0.6, span), decay: 1.5, amp: 0.1, attack: 0.25 });
    for (let i = 0; i < 6; i++) tone(sfx, t + 0.12 * i, { f: 2000 + i * 180, dur: 0.15, decay: 20, amp: 0.04 });
  },
  chime: (t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(sfx, t + i * 0.13, { f, dur: 1.6, decay: 2.5, amp: 0.12, type: 'tri' })),
};

for (const c of cues) {
  const fn = SFX[c.type];
  if (!fn) throw new Error(`Unknown SFX "${c.type}"`);
  fn(c.t, c.span, c.n);
}

// Music bed: soft chord pad + light beat at 100 BPM (C - Am - F - G).
const chords = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
const CH = 4.8; // seconds per chord (2 bars at 100 BPM)
const musicEnd = total - 0.5;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (t > musicEnd + 1.5) break;
  const idx = Math.floor(t / CH) % chords.length;
  const lt = t % CH;
  const env = Math.min(1, lt / 0.9) * Math.min(1, (CH - lt) / 0.9);
  let v = 0;
  for (const f of chords[idx]) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * t);
  v += 0.8 * Math.sin(2 * Math.PI * (chords[idx][0] / 2) * t);
  const fadeIn = Math.min(1, t / 2);
  const fadeOut = Math.max(0, Math.min(1, (musicEnd + 1.5 - t) / 2));
  music[i] = v * env * 0.018 * fadeIn * fadeOut;
}
const BEAT = 0.6;
for (let b = 0; b * BEAT < musicEnd; b++) {
  const t = b * BEAT;
  tone(music, t, { f: 120, f2: 45, dur: 0.25, decay: 14, amp: b % 2 === 0 ? 0.14 : 0.07 });
  noise(music, t + BEAT / 2, { dur: 0.04, amp: 0.025, lo: 6000, hi: 9000 });
}

// Voice-over placement, normalized per clip.
for (const e of timeline) {
  const clip = vo[e.id];
  if (!clip) continue;
  let peak = 0;
  for (const v of clip) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.85 / peak : 1;
  const s0 = Math.floor(e.voStart * SR);
  for (let i = 0; i < clip.length && s0 + i < N; i++) voice[s0 + i] += clip[i] * g;
}

// Duck the music under the voice-over.
const target = new Float32Array(N).fill(1);
for (const e of timeline) {
  if (!e.voDur) continue;
  const a = Math.floor((e.voStart - 0.2) * SR), b = Math.floor((e.voStart + e.voDur + 0.2) * SR);
  for (let i = Math.max(0, a); i < Math.min(N, b); i++) target[i] = 0.35;
}
let duck = 1;
const coef = 1 - Math.exp(-1 / (0.15 * SR));
const mix = new Float32Array(N);
let peak = 0;
for (let i = 0; i < N; i++) {
  duck += coef * (target[i] - duck);
  mix[i] = voice[i] + sfx[i] * 0.9 + music[i] * duck;
  peak = Math.max(peak, Math.abs(mix[i]));
}
const norm = peak > 0.97 ? 0.97 / peak : 1;

const wavPath = path.join(BUILD, 'mix.wav');
const dataLen = N * 2 * 2;
const wav = Buffer.alloc(44 + dataLen);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataLen, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(dataLen, 40);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, mix[i] * norm));
  const s = Math.round(v * 32767);
  wav.writeInt16LE(s, 44 + i * 4);
  wav.writeInt16LE(s, 46 + i * 4);
}
fs.writeFileSync(wavPath, wav);
console.log(`Audio mixed: ${wavPath} (peak ${peak.toFixed(2)}, norm ${norm.toFixed(2)})`);

// ---------------------------------------------------------------- render + encode
const outMp4 = path.join(OUT, 'relief-chain-demo.mp4');
const frames = Math.ceil(total * FPS);
const ff = spawn(
  ffmpegPath,
  ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', wavPath, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', outMp4],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);
const ffDone = once(ff, 'close');

const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((t) => window.__render(t), i / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  if (i % 300 === 0) {
    const el = (Date.now() - t0) / 1000;
    const eta = i > 0 ? ((frames - i) * el) / i : 0;
    console.log(`Frame ${i}/${frames} (${((100 * i) / frames).toFixed(1)}%) · elapsed ${el.toFixed(0)}s · eta ${eta.toFixed(0)}s`);
  }
}
ff.stdin.end();
const [code] = await ffDone;
await browser.close();
if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
console.log(`Done: ${outMp4} (${total.toFixed(1)}s, ${frames} frames)`);
