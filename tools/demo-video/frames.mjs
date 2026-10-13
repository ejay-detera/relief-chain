// Extracts PNG frames from a recorded clip for review.
// Usage: node frames.mjs <clipId> <sec1,sec2,...>   (seconds relative to clip start)
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [id, secs] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'clips', 'clips.json'), 'utf8'))[id];
const out = path.join(ROOT, 'out', 'frames');
fs.mkdirSync(out, { recursive: true });
for (const s of secs.split(',').map(Number)) {
  const file = path.join(out, `${id}-${s}.png`);
  execFileSync(ffmpegPath, ['-v', 'error', '-y', '-ss', String(m.startOffset + s), '-i', path.join(ROOT, 'build', 'clips', m.file), '-frames:v', '1', '-vf', 'scale=430:-1', file]);
  console.log(file);
}
