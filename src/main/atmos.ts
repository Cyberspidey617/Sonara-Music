/*
 * Dolby Atmos from lossless sources. A source can offer a song's Atmos mix (E-AC-3 with Atmos
 * objects), which Chromium can't decode. Sonara decodes it with FFmpeg built as WebAssembly (shipped
 * beside the app, the same file on every platform), in a thread of its own so the app never waits,
 * into a multichannel FLAC the player plays like any lossless file: the 5.1 or 7.1 bed. Atmos's
 * height objects aren't rendered (as on a phone without a full Dolby decoder); the player places
 * the channels on speakers around you on headphones, or sends them to a surround system as they are.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { app } from 'electron';
import { log } from './log';

/** Where the decoder lives: beside the app when installed, in node_modules when run from source. */
const coreDir = () => (app.isPackaged ? path.join(process.resourcesPath, 'ffmpeg') : path.join(app.getAppPath(), 'node_modules/@ffmpeg/core/dist/umd'));

/** Whether this copy of Sonara has the decoder. */
export const atmosDecoderAvailable = () => fs.existsSync(path.join(coreDir(), 'ffmpeg-core.wasm'));

/** The decoding thread: FFmpeg reads the mix and writes the channels as 24-bit FLAC. */
const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
// The build expects a browser worker's globals.
globalThis.self = globalThis;
globalThis.location = { href: 'file:///' };
const createCore = require(path.join(workerData.coreDir, 'ffmpeg-core.js'));
(async () => {
  try {
    const core = await createCore({ wasmBinary: fs.readFileSync(path.join(workerData.coreDir, 'ffmpeg-core.wasm')) });
    let audio = '';
    core.setLogger(({ message }) => { if (/Audio:/.test(message) && !audio) audio = message; });
    core.FS.writeFile('in', fs.readFileSync(workerData.input));
    const code = core.exec('-i', 'in', '-vn', '-c:a', 'flac', '-sample_fmt', 's32', '-bits_per_raw_sample', '24', 'out.flac');
    if (code !== 0) throw new Error('FFmpeg stopped with ' + code + (audio ? ' (' + audio.trim() + ')' : ''));
    fs.writeFileSync(workerData.output, core.FS.readFile('out.flac'));
    parentPort.postMessage({ ok: true, audio });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: String(error && error.message || error) });
  }
})();
`;

export interface DecodedAtmos {
  file: string;
  /** 6 for 5.1, 8 for 7.1. */
  channels: number;
  sampleRate: number;
}

const channelsOf = (audio: string) => (/7\.1/.test(audio) ? 8 : /5\.1/.test(audio) ? 6 : /stereo/.test(audio) ? 2 : 6);

let queue: Promise<unknown> = Promise.resolve();
const decoding = new Map<string, Promise<DecodedAtmos>>();

/** Decodes the mix in [input] (once; kept beside it), one at a time. */
export function decodeAtmos(input: string): Promise<DecodedAtmos> {
  const output = input.replace(/\.[^.\\/]+$/, '') + '.atmos.flac';
  const meta = output + '.json';
  if (fs.existsSync(output) && fs.existsSync(meta)) return Promise.resolve(JSON.parse(fs.readFileSync(meta, 'utf8')) as DecodedAtmos);
  const running = decoding.get(output);
  if (running) return running;
  const job = (queue = queue.catch(() => undefined).then(
    () =>
      new Promise<DecodedAtmos>((resolve, reject) => {
        const started = Date.now();
        const worker = new Worker(WORKER, { eval: true, workerData: { coreDir: coreDir(), input, output } });
        worker.once('message', (m: { ok: boolean; audio?: string; error?: string }) => {
          void worker.terminate();
          if (!m.ok) return reject(new Error(m.error ?? 'decoding failed'));
          const audio = m.audio ?? '';
          const decoded: DecodedAtmos = { file: output, channels: channelsOf(audio), sampleRate: Number(audio.match(/(\d+) Hz/)?.[1]) || 48000 };
          fs.writeFileSync(meta, JSON.stringify(decoded));
          log.info(`Dolby Atmos decoded in ${Date.now() - started}ms (${audio.trim()})`);
          resolve(decoded);
        });
        worker.once('error', reject);
      }),
  )) as Promise<DecodedAtmos>;
  decoding.set(output, job);
  void job.finally(() => decoding.delete(output));
  return job;
}

/** Downloads a source's file (a whole song, kept with the lossless cache). */
export async function downloadTo(url: string, dir: string, key: string): Promise<string> {
  const file = path.join(dir, `${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}.ec3src`);
  if (fs.existsSync(file)) return file;
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`the source's file answered ${res.status}`);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(`${file}.part`, Buffer.from(await res.arrayBuffer()));
  await fs.promises.rename(`${file}.part`, file);
  return file;
}
