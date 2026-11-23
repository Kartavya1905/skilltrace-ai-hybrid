#!/usr/bin/env node
/**
 * Generates the ORIGINAL Learning Lab media from apps/web/src/content/media-scripts.json:
 *   1. Narration: Windows built-in speech synthesis (System.Speech, offline, free) -> WAV per sentence.
 *   2. Captions: WebVTT cues timed from the real WAV durations.
 *   3. Encoding: headless Chromium (Playwright) renders slides on a canvas and encodes a seekable
 *      WebM (VP9 video + Opus audio) with WebCodecs via mediabunny.
 *
 * Usage:  node scripts/generate-lab-media.mjs        (Windows + installed Google Chrome)
 * Output: apps/web/public/lab/media/{python-functions,sql-select}.{webm,vtt}
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(
  readFileSync(join(root, 'apps/web/src/content/media-scripts.json'), 'utf8'),
);
const outDir = join(root, 'apps/web/public/lab/media');
const tmp = join(root, 'scripts/.media-tmp');
const SAMPLE_RATE = 48_000; // Opus requires 48 kHz
const GAP_SENTENCE = 0.4;
const GAP_SLIDE = 0.9;
const LEAD = 0.6;

mkdirSync(outDir, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

function synthesize(name, sentences) {
  const list = join(tmp, `${name}.json`);
  writeFileSync(
    list,
    JSON.stringify(sentences.map((text, i) => ({ text, file: join(tmp, `${name}-${i}.wav`) }))),
  );
  const ps = `
Add-Type -AssemblyName System.Speech
$items = Get-Content -Raw -LiteralPath '${list.replace(/'/g, "''")}' | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $s.SelectVoice('Microsoft Zira Desktop') } catch {}
$s.Rate = 0
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(${SAMPLE_RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($it in $items) { $s.SetOutputToWaveFile($it.file, $fmt); $s.Speak($it.text) }
$s.Dispose()
`;
  const psFile = join(tmp, `${name}.ps1`);
  writeFileSync(psFile, ps);
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], {
    stdio: 'inherit',
  });
}

function readWav(file) {
  const buf = readFileSync(file);
  let off = 12;
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      const samples = new Float32Array(size / 2);
      for (let i = 0; i < samples.length; i++)
        samples[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
      return samples;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error(`No data chunk in ${file}`);
}

const vttTime = (s) => {
  const ms = Math.round(s * 1000);
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const sec = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${sec}.${String(ms % 1000).padStart(3, '0')}`;
};

function assemble(name, lesson) {
  const sentences = lesson.slides.flatMap((s) => s.narration);
  synthesize(name, sentences);
  const pieces = [];
  const cues = [];
  const slideTimes = [];
  let t = LEAD;
  let k = 0;
  for (const slide of lesson.slides) {
    const start = t;
    for (let i = 0; i < slide.narration.length; i++) {
      const pcm = readWav(join(tmp, `${name}-${k++}.wav`));
      const dur = pcm.length / SAMPLE_RATE;
      pieces.push({ at: t, pcm });
      cues.push({ start: t, end: t + dur, text: slide.narration[i] });
      t += dur + (i === slide.narration.length - 1 ? 0 : GAP_SENTENCE);
    }
    t += GAP_SLIDE;
    slideTimes.push({
      start: Math.max(0, start - (slideTimes.length ? GAP_SLIDE / 2 : start)),
      end: t - GAP_SLIDE / 2,
    });
  }
  const total = t;
  const audio = new Float32Array(Math.ceil(total * SAMPLE_RATE));
  for (const p of pieces) audio.set(p.pcm, Math.round(p.at * SAMPLE_RATE));
  slideTimes[slideTimes.length - 1].end = total;
  const vtt = [
    'WEBVTT',
    '',
    ...cues.map((c, i) => `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${c.text}\n`),
  ].join('\n');
  writeFileSync(join(outDir, `${name}.vtt`), vtt);
  const int16 = Buffer.alloc(audio.length * 2);
  for (let i = 0; i < audio.length; i++)
    int16.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(audio[i] * 32767))), i * 2);
  return { total, slideTimes, pcmBase64: int16.toString('base64') };
}

const mediabunny = readFileSync(
  join(root, 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'),
  'utf8',
);
// Prefer installed Google Chrome (no browser download); falls back to Playwright's Chromium.
const browser = await chromium
  .launch({ channel: process.env.MEDIA_BROWSER_CHANNEL ?? 'chrome' })
  .catch(() => chromium.launch());
const page = await browser.newPage();
// A routed localhost origin is a secure context, which WebCodecs requires.
await page.route('http://localhost:59999/**', (route) => {
  const url = route.request().url();
  if (url.endsWith('/mediabunny.mjs'))
    return route.fulfill({ body: mediabunny, contentType: 'text/javascript' });
  return route.fulfill({
    body: '<!doctype html><html><body></body></html>',
    contentType: 'text/html',
  });
});
await page.goto('http://localhost:59999/');

for (const [name, lesson] of Object.entries(scripts)) {
  console.log(`Generating ${name} (${lesson.kind})...`);
  const { total, slideTimes, pcmBase64 } = assemble(name, lesson);
  const b64 = await page.evaluate(
    async ({ lesson, total, slideTimes, pcmBase64, SAMPLE_RATE }) => {
      const MB = await import('/mediabunny.mjs');
      const bin = atob(pcmBase64);
      const pcm = new Float32Array(bin.length / 2);
      for (let i = 0; i < pcm.length; i++) {
        let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
        if (v >= 0x8000) v -= 0x10000;
        pcm[i] = v / 32768;
      }
      const output = new MB.Output({
        format: new MB.WebMOutputFormat(),
        target: new MB.BufferTarget(),
      });
      let canvas = null;
      let videoSource = null;
      if (lesson.kind === 'video') {
        canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        videoSource = new MB.CanvasSource(canvas, {
          codec: 'vp9',
          quality: MB.QUALITY_MEDIUM,
          keyFrameInterval: 1,
        });
        output.addVideoTrack(videoSource, { frameRate: 10 });
      }
      const audioSource = new MB.AudioBufferSource({ codec: 'opus', quality: MB.QUALITY_MEDIUM });
      output.addAudioTrack(audioSource);
      await output.start();

      // Audio in 1-second chunks to respect encoder backpressure.
      for (let off = 0; off < pcm.length; off += SAMPLE_RATE) {
        const chunk = pcm.subarray(off, Math.min(pcm.length, off + SAMPLE_RATE));
        const ab = new AudioBuffer({
          length: chunk.length,
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 1,
        });
        ab.copyToChannel(chunk, 0);
        await audioSource.add(ab);
      }

      if (canvas && videoSource) {
        const ctx = canvas.getContext('2d');
        const wrap = (text, x, y, maxW, lh) => {
          const words = text.split(' ');
          let line = '';
          for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (ctx.measureText(test).width > maxW && line) {
              ctx.fillText(line, x, y);
              line = w;
              y += lh;
            } else line = test;
          }
          ctx.fillText(line, x, y);
          return y + lh;
        };
        const fps = 10;
        const frames = Math.ceil(total * fps);
        for (let f = 0; f < frames; f++) {
          const t = f / fps;
          const idx = Math.max(
            0,
            slideTimes.findIndex((s) => t >= s.start && t < s.end),
          );
          const slide = lesson.slides[idx === -1 ? lesson.slides.length - 1 : idx];
          const g = ctx.createLinearGradient(0, 0, 1280, 720);
          g.addColorStop(0, '#1e1b4b');
          g.addColorStop(1, '#312e81');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 1280, 720);
          ctx.fillStyle = '#a5b4fc';
          ctx.font = '600 22px sans-serif';
          ctx.fillText(`SkillTrace Learning Lab · ${lesson.title}`, 64, 64);
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 54px sans-serif';
          let y = wrap(slide.heading, 64, 150, 1150, 62);
          ctx.font = '400 32px sans-serif';
          ctx.fillStyle = '#e0e7ff';
          y += 10;
          for (const b of slide.bullets ?? [])
            y = wrap(`•  ${b}`, 80, y, slide.code ? 520 : 1100, 44) + 6;
          if (slide.code) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(640, 200, 576, 380);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '400 24px monospace';
            slide.code.split('\n').forEach((line, i) => ctx.fillText(line, 664, 244 + i * 34));
          }
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(64, 660, 1152, 8);
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(64, 660, 1152 * (t / total), 8);
          ctx.fillStyle = '#c7d2fe';
          ctx.font = '400 20px sans-serif';
          ctx.fillText(`Slide ${idx + 1} of ${lesson.slides.length}`, 64, 700);
          ctx.fillText('Original content · Apache-2.0', 960, 700);
          await videoSource.add(t, 1 / fps);
        }
      }
      await output.finalize();
      const bytes = new Uint8Array(output.target.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { lesson, total, slideTimes, pcmBase64, SAMPLE_RATE },
  );
  const file = join(outDir, `${name}.webm`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(
    `  wrote ${file} (${(Buffer.from(b64, 'base64').length / 1024).toFixed(0)} KiB, ${total.toFixed(1)} s)`,
  );
}
await browser.close();
if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
console.log('Done.');
