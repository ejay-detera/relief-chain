// Synthesized SFX + music bed, mixed with per-scene voice-over into a WAV.
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const SR = 48000;

export const decode = (file) => {
  const out = execFileSync(ffmpegPath, ['-v', 'error', '-i', file, '-ar', String(SR), '-ac', '1', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
};

export const mixAudio = ({ total, scenes, cues, outPath }) => {
  const N = Math.ceil(total * SR) + SR;
  const sfx = new Float32Array(N);
  const music = new Float32Array(N);
  const voice = new Float32Array(N);
  let seed = 99991;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const tone = (buf, t0, { f = 1000, f2 = null, dur = 0.1, amp = 0.3, decay = 20, type = 'sine', attack = 0.002 }) => {
    const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / SR;
      const fr = f2 ? f * Math.pow(f2 / f, i / n) : f;
      ph += (2 * Math.PI * fr) / SR;
      const s = Math.sin(ph);
      const v = type === 'square' ? Math.sign(s) * 0.5 : type === 'tri' ? (2 / Math.PI) * Math.asin(s) : s;
      const env = Math.min(1, tt / attack) * Math.exp(-decay * tt) * Math.min(1, (n - i) / (0.004 * SR));
      const k = s0 + i;
      if (k >= 0 && k < N) buf[k] += v * env * amp;
    }
  };
  const noise = (buf, t0, { dur = 0.5, amp = 0.3, lo = 300, hi = 5000 }) => {
    const s0 = Math.floor(t0 * SR), n = Math.floor(dur * SR);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const fc = lo + (hi - lo) * Math.sin(Math.PI * u);
      y += (1 - Math.exp((-2 * Math.PI * fc) / SR)) * (rnd() * 2 - 1 - y);
      const k = s0 + i;
      if (k >= 0 && k < N) buf[k] += y * Math.pow(Math.sin(Math.PI * u), 2) * amp;
    }
  };
  const SFX = {
    whoosh: (t) => noise(sfx, t - 0.22, { dur: 0.55, amp: 0.5, lo: 250, hi: 4200 }),
    tap: (t) => { tone(sfx, t, { f: 1700, dur: 0.05, decay: 90, amp: 0.2 }); tone(sfx, t, { f: 600, dur: 0.05, decay: 110, amp: 0.14 }); },
    pop: (t) => tone(sfx, t, { f: 380, f2: 950, dur: 0.1, decay: 28, amp: 0.2 }),
    success: (t) => { tone(sfx, t, { f: 880, dur: 0.3, decay: 9, amp: 0.15, type: 'tri' }); tone(sfx, t + 0.11, { f: 1318.5, dur: 0.5, decay: 6, amp: 0.15, type: 'tri' }); },
    toggle: (t) => { tone(sfx, t, { f: 900, dur: 0.03, decay: 150, amp: 0.2 }); tone(sfx, t + 0.05, { f: 1300, dur: 0.03, decay: 150, amp: 0.18 }); },
    chime: (t) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(sfx, t + i * 0.13, { f, dur: 1.6, decay: 2.5, amp: 0.12, type: 'tri' })),
    down: (t) => tone(sfx, t, { f: 900, f2: 220, dur: 0.45, decay: 4, amp: 0.14, type: 'tri' }),
    up: (t) => tone(sfx, t, { f: 300, f2: 1200, dur: 0.45, decay: 3, amp: 0.13, type: 'tri' }),
  };
  for (const c of cues) {
    const fn = SFX[c.type];
    if (!fn) throw new Error(`Unknown SFX "${c.type}"`);
    fn(c.t);
  }

  // Music bed: soft chord pad + light beat (C - Am - F - G).
  const chords = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
  const CH = 4.8, end = total - 0.3;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    if (t > end + 1.5) break;
    const ch = chords[Math.floor(t / CH) % 4];
    const lt = t % CH;
    const env = Math.min(1, lt / 0.9) * Math.min(1, (CH - lt) / 0.9);
    let v = 0.8 * Math.sin(2 * Math.PI * (ch[0] / 2) * t);
    for (const f of ch) v += Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 1.003 * t);
    music[i] = v * env * 0.016 * Math.min(1, t / 2) * Math.max(0, Math.min(1, (end + 1.5 - t) / 2));
  }
  for (let b = 0; b * 0.6 < end; b++) {
    tone(music, b * 0.6, { f: 120, f2: 45, dur: 0.25, decay: 14, amp: b % 2 === 0 ? 0.12 : 0.06 });
    noise(music, b * 0.6 + 0.3, { dur: 0.04, amp: 0.02, lo: 6000, hi: 9000 });
  }

  // Voice-over, normalized per clip; music ducks underneath it.
  const target = new Float32Array(N).fill(1);
  for (const s of scenes) {
    if (!s.voClip) continue;
    let peak = 0;
    for (const v of s.voClip) peak = Math.max(peak, Math.abs(v));
    const g = peak > 0 ? 0.85 / peak : 1;
    const s0 = Math.floor(s.voStart * SR);
    for (let i = 0; i < s.voClip.length && s0 + i < N; i++) voice[s0 + i] += s.voClip[i] * g;
    for (let i = Math.max(0, s0 - 0.2 * SR); i < Math.min(N, s0 + s.voClip.length + 0.2 * SR); i++) target[i] = 0.3;
  }
  let duck = 1, peak = 0;
  const coef = 1 - Math.exp(-1 / (0.15 * SR));
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    duck += coef * (target[i] - duck);
    mix[i] = voice[i] + sfx[i] * 0.85 + music[i] * duck;
    peak = Math.max(peak, Math.abs(mix[i]));
  }
  const norm = peak > 0.97 ? 0.97 / peak : 1;
  const dataLen = N * 4;
  const wav = Buffer.alloc(44 + dataLen);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataLen, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < N; i++) {
    const s = Math.round(Math.max(-1, Math.min(1, mix[i] * norm)) * 32767);
    wav.writeInt16LE(s, 44 + i * 4); wav.writeInt16LE(s, 46 + i * 4);
  }
  fs.writeFileSync(outPath, wav);
  return { peak, norm };
};
