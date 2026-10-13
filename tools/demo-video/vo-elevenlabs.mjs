// ElevenLabs voice-over: one MP3 per scene in build/vo/<id>.mp3.
// Reads ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL_ID from the
// environment or from the gitignored .env.local next to this file.
// Clips are cached by a hash of (voice, model, text) so re-renders don't re-bill.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const loadEnv = () => {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
};

export const hasElevenLabs = () => {
  loadEnv();
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
};

export const synthesizeElevenLabs = async (scenes, outDir) => {
  loadEnv();
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID;
  const model = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
  if (!key || !voice) throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID are required.');
  fs.mkdirSync(outDir, { recursive: true });
  const files = {};
  for (const s of scenes) {
    const text = s.say ?? s.vo;
    if (!text) continue;
    const hash = crypto.createHash('sha256').update(`${voice}|${model}|${text}`).digest('hex').slice(0, 16);
    const file = path.join(outDir, `${s.id}-${hash}.mp3`);
    files[s.id] = file;
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      console.log(`  ${s.id}: cached`);
      continue;
    }
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
        }),
      },
    );
    if (!res.ok) {
      // Never print the key; the body is ElevenLabs' error JSON.
      throw new Error(`ElevenLabs ${res.status} for scene ${s.id}: ${(await res.text()).slice(0, 300)}`);
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  ${s.id}: generated (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  }
  return files;
};
