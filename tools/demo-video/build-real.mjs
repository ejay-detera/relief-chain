// Assembles the final demo video from REAL app recordings (record.mjs):
// phone-framed clips + titles + captions + voice-over + SFX + music.
//
// Usage:
//   node build-real.mjs                    full render -> out/relief-chain-real-demo.mp4
//   node build-real.mjs --stills 10,40     PNG stills only
import { chromium } from 'playwright-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SR, decode, mixAudio } from './audio.mjs';
import { hasElevenLabs, loadEnv, synthesizeElevenLabs } from './vo-elevenlabs.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(ROOT, 'build');
const CLIPS = path.join(BUILD, 'clips');
const MP4S = path.join(BUILD, 'clips-mp4');
const OUT = path.join(ROOT, 'out');
const FPS = 30, MAX_TOTAL = 295, LEAD = 0.7, TAIL = 0.9, MAX_RATE = 2.2;
const args = process.argv.slice(2);
const stillsArg = args.includes('--stills') ? args[args.indexOf('--stills') + 1] : null;
fs.mkdirSync(MP4S, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const scenes = JSON.parse(fs.readFileSync(path.join(ROOT, 'scenes-real.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(CLIPS, 'clips.json'), 'utf8'));

// 1. Transcode recordings to all-intra H.264 so every frame seeks exactly.
for (const file of new Set(Object.values(manifest).map((m) => m.file))) {
  const dst = path.join(MP4S, file.replace(/\.webm$/, '.mp4'));
  const src = path.join(CLIPS, file);
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs > fs.statSync(src).mtimeMs) continue;
  console.log(`Transcoding ${file}...`);
  execFileSync(ffmpegPath, ['-v', 'error', '-y', '-i', src, '-r', '30', '-c:v', 'libx264', '-g', '1', '-crf', '16', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-an', dst]);
}

// 2. Voice-over: ElevenLabs when a valid key is configured, otherwise Windows speech.
loadEnv();
const keyOk = hasElevenLabs() && (process.env.ELEVENLABS_API_KEY ?? '').startsWith('sk_');
const voFiles = {};
if (keyOk) {
  console.log('Voice-over: ElevenLabs');
  Object.assign(voFiles, await synthesizeElevenLabs(scenes, path.join(BUILD, 'vo-eleven')));
} else {
  console.log('Voice-over: Windows speech (ElevenLabs key missing or not an sk_ key)');
  const json = path.join(BUILD, 'scenes-real-vo.json');
  fs.writeFileSync(json, JSON.stringify(scenes.filter((s) => s.vo)));
  execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'vo.ps1'), '-Json', json, '-Out', path.join(BUILD, 'vo-real'), '-Rate', '1'], { stdio: 'inherit' });
  for (const s of scenes) if (s.vo) voFiles[s.id] = path.join(BUILD, 'vo-real', `${s.id}.wav`);
}

// 3. Timeline: scene length follows the voice-over; clips speed up (<= MAX_RATE) to fit.
const timeline = [];
let t = 0;
for (const s of scenes) {
  const voClip = voFiles[s.id] ? decode(voFiles[s.id]) : null;
  const voDur = voClip ? voClip.length / SR : 0;
  let dur = s.dur ?? LEAD + voDur + TAIL;
  const e = { id: s.id, act: s.act, kicker: s.kicker, title: s.title, chips: s.chips, note: s.note, text: s.vo ?? '', voClip, voDur };
  if (s.clip) {
    const m = manifest[s.clip];
    if (!m) throw new Error(`Clip "${s.clip}" was not recorded.`);
    const clipDelay = 0.4;
    dur = Math.max(dur, m.duration / MAX_RATE + clipDelay + 0.6);
    const rate = Math.max(1, m.duration / (dur - clipDelay - 0.6));
    Object.assign(e, {
      clipSrc: pathToFileURL(path.join(MP4S, m.file.replace(/\.webm$/, '.mp4'))).href,
      clipStart: m.startOffset, clipDur: m.duration, rate, clipDelay,
      taps: m.taps.map((x) => t + clipDelay + (x - m.startOffset) / rate).filter((x) => x > t && x < t + dur),
      extraCues: [],
    });
    if (m.marks?.offline) e.extraCues.push({ t: t + clipDelay + (m.marks.offline - m.startOffset) / rate, type: 'down' });
    if (m.marks?.online) e.extraCues.push({ t: t + clipDelay + (m.marks.online - m.startOffset) / rate, type: 'up' });
    if (s.id === 'wizardPublish' || s.id === 'distributeRun') e.extraCues.push({ t: t + dur - 1.6, type: 'success' });
  }
  if (s.id === 'title') e.extraCues = [{ t: 0.15, type: 'pop' }];
  if (s.id === 'end') e.extraCues = [{ t: t + 0.3, type: 'chime' }];
  e.start = t;
  e.dur = dur;
  e.voStart = t + LEAD;
  timeline.push(e);
  t += dur;
}
const total = t;
console.log(`Timeline: ${timeline.length} scenes, ${total.toFixed(1)}s`);
for (const e of timeline) console.log(`  ${e.id.padEnd(17)} ${e.start.toFixed(1).padStart(6)}s  dur ${e.dur.toFixed(1)}s${e.rate ? `  clip x${e.rate.toFixed(2)}` : ''}`);
if (total > MAX_TOTAL) throw new Error(`Video is ${total.toFixed(1)}s, over ${MAX_TOTAL}s.`);

// 4. Compositor page.
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(ROOT, 'comp.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const pageTimeline = timeline.map(({ voClip, ...rest }) => rest);
const vids = await page.evaluate((tl) => window.__setup(tl), pageTimeline);
const bad = vids.filter((v) => !(v.ready >= 2));
if (bad.length) throw new Error(`Clips failed to load in the compositor: ${JSON.stringify(bad)}`);

if (stillsArg) {
  const dir = path.join(OUT, 'stills-real');
  fs.mkdirSync(dir, { recursive: true });
  for (const sec of stillsArg.split(',').map(Number)) {
    await page.evaluate((x) => window.__render(x), sec);
    const file = path.join(dir, `still-${String(sec).padStart(3, '0')}s.png`);
    await page.screenshot({ path: file });
    console.log(`Still: ${file}`);
  }
  await browser.close();
  process.exit(0);
}

const cues = await page.evaluate(() => window.__cues());
const wavPath = path.join(BUILD, 'mix-real.wav');
const { peak } = mixAudio({ total, scenes: timeline, cues, outPath: wavPath });
console.log(`Audio mixed (${cues.length} SFX cues, peak ${peak.toFixed(2)})`);

// 5. Render frames and encode.
const outMp4 = path.join(OUT, 'relief-chain-real-demo.mp4');
const frames = Math.ceil(total * FPS);
const ff = spawn(ffmpegPath, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', wavPath, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', outMp4], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = once(ff, 'close');
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await page.evaluate((x) => window.__render(x), i / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  if (i % 300 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`Frame ${i}/${frames} · ${el.toFixed(0)}s elapsed · eta ${i ? (((frames - i) * el) / i).toFixed(0) : '?'}s`);
  }
}
ff.stdin.end();
const [code] = await done;
await browser.close();
if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
console.log(`Done: ${outMp4} (${total.toFixed(1)}s)`);
