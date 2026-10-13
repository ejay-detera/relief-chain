// Builds contact sheets (one frame every N seconds) of the final video so
// every scene can be checked for error screens at a glance.
// Each sheet stays <= MAX_SIDE px on its longest side; frames are split across
// several sheets (contact-sheet-01.png, -02, ...) instead of shrinking tiles.
// Usage: node contact-sheet.mjs [everySec=2] [video=out/relief-chain-real-demo.mp4]
import ffmpegPath from 'ffmpeg-static';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_SIDE = 1600;
const TILE_W = 380, COLS = 4, ROWS = 6, PAD = 4;
const every = Number(process.argv[2] ?? 2);
const src = path.resolve(ROOT, process.argv[3] ?? path.join('out', 'relief-chain-real-demo.mp4'));
const outDir = path.join(ROOT, 'out');

const probe = String(spawnSync(ffmpegPath, ['-i', src]).stderr);
const d = probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
const v = probe.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
if (!d || !v) throw new Error(`Could not probe ${src}`);
const duration = +d[1] * 3600 + +d[2] * 60 + +d[3];
const tileH = Math.round((TILE_W * +v[2]) / +v[1] / 2) * 2;
const sheetW = COLS * TILE_W + (COLS + 1) * PAD;
const sheetH = ROWS * tileH + (ROWS + 1) * PAD;
if (Math.max(sheetW, sheetH) > MAX_SIDE) throw new Error(`Grid ${sheetW}x${sheetH} exceeds ${MAX_SIDE}px`);

// PNG IHDR: width at byte 16, height at byte 20.
const pngSize = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

for (const f of fs.readdirSync(outDir)) if (/^contact-sheet(-\d+)?\.png$/.test(f)) fs.rmSync(path.join(outDir, f));

const perSheet = COLS * ROWS;
const span = perSheet * every;
const sheets = Math.ceil(duration / span);
for (let i = 0; i < sheets; i++) {
  const start = i * span;
  const out = path.join(outDir, `contact-sheet-${String(i + 1).padStart(2, '0')}.png`);
  execFileSync(ffmpegPath, ['-v', 'error', '-y', '-ss', String(start), '-t', String(span), '-i', src,
    '-vf', `fps=1/${every},scale=${TILE_W}:${tileH},tile=${COLS}x${ROWS}:padding=${PAD}:margin=${PAD}:color=white`,
    '-frames:v', '1', out]);
  const [w, h] = pngSize(out);
  if (w > MAX_SIDE || h > MAX_SIDE) throw new Error(`${out} is ${w}x${h}, over ${MAX_SIDE}px`);
  console.log(`${out}  ${w}x${h}  covers ${start}s-${Math.min(duration, start + span).toFixed(1)}s`);
}
