/*
 * The equalizer: 10 peaking filters at the ISO octave centres (32 Hz – 16 kHz), then Spatial Audio.
 *
 * Audio quality comes first:
 * - Until the equalizer is first switched on, nothing changes: the <audio>
 *   elements play straight to Windows, exactly as before.
 * - Once on, both decks feed one Web Audio graph running at the output
 *   device's own sample rate (no extra resampling) in 32-bit float.
 * - Switched off again, or on with every band at 0 dB, the filters are taken
 *   out of the path entirely: the signal goes source → output untouched.
 * - Boosts would clip, so by default the level is lowered by the largest
 *   boost ("Prevent clipping"); cuts never lower the level.
 */
import { EQ_FREQUENCIES, type EqSettings, type SpatialAudio } from '@shared/types';
import { useLibrary } from '@/state/library';

export const EQ_MIN = -12;
export const EQ_MAX = 12;
const Q = 1.41; // one octave wide, as graphic EQs use

export interface EqPreset {
  id: string;
  name: string;
  bands: number[];
}

/**
 * The curves most players ship (Apple Music/iTunes, Spotify, Winamp share these names).
 * The first eight are the ones people reach for most and are shown first.
 */
export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass-boost', name: 'Bass Booster', bands: [5.5, 4.5, 3.5, 2.5, 1.25, 0, 0, 0, 0, 0] },
  { id: 'vocal', name: 'Vocal Booster', bands: [-1.5, -3, -3, 1.5, 3.75, 3.75, 3, 1.5, 0, -1.5] },
  { id: 'treble-boost', name: 'Treble Booster', bands: [0, 0, 0, 0, 0, 1.25, 2.5, 3.5, 4.25, 5.5] },
  { id: 'pop', name: 'Pop', bands: [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5] },
  { id: 'rock', name: 'Rock', bands: [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5] },
  { id: 'hip-hop', name: 'Hip-Hop', bands: [5, 4.25, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3] },
  { id: 'electronic', name: 'Electronic', bands: [4.25, 3.8, 1.2, 0, -2.15, 2.2, 0.85, 1.25, 3.95, 4.8] },
  { id: 'loudness', name: 'Loudness', bands: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1] },
  { id: 'acoustic', name: 'Acoustic', bands: [5, 4.9, 3.95, 1.05, 2.1, 1.75, 3.5, 4.1, 3.55, 2.15] },
  { id: 'classical', name: 'Classical', bands: [4.75, 3.75, 3, 2.5, -1.5, -1.5, 0, 2.25, 3.25, 3.75] },
  { id: 'jazz', name: 'Jazz', bands: [4, 3, 1.5, 2.25, -1.5, -1.5, 0, 1.5, 3, 3.75] },
  { id: 'dance', name: 'Dance', bands: [3.6, 6.5, 5, 0, 1.9, 3.65, 5.15, 4.55, 3.6, 0] },
  { id: 'rnb', name: 'R&B', bands: [2.6, 6.9, 5.65, 1.35, -2.2, -1.5, 2.3, 2.65, 3, 3.75] },
  { id: 'deep', name: 'Deep', bands: [4.95, 3.55, 1.75, 1, 2.85, 2.5, 1.45, -2.15, -3.55, -4.6] },
  { id: 'latin', name: 'Latin', bands: [4.5, 3, 0, 0, -1.5, -1.5, -1.5, 0, 3, 4.5] },
  { id: 'lounge', name: 'Lounge', bands: [-3, -1.5, -0.5, 1.5, 4, 2.5, 0, -1.5, 2, 1] },
  { id: 'piano', name: 'Piano', bands: [3, 2, 0, 2.5, 3, 1.5, 3.5, 4.5, 3, 3.5] },
  { id: 'late-night', name: 'Late Night', bands: [-2, -1, 0, 1, 2, 2.5, 2.5, 1.5, 0, -1.5] },
  { id: 'small-speakers', name: 'Small Speakers', bands: [5.5, 4.25, 3.5, 2.5, 1.25, 0, -1.25, -2.5, -3.5, -4.25] },
  { id: 'spoken', name: 'Spoken Word', bands: [-3.5, -0.5, 0, 0.7, 3.5, 4.6, 4.85, 4.3, 2.55, 0] },
  { id: 'bass-cut', name: 'Bass Reducer', bands: [-5.5, -4.25, -3.5, -2.5, -1.25, 0, 0, 0, 0, 0] },
  { id: 'treble-cut', name: 'Treble Reducer', bands: [0, 0, 0, 0, 0, -1.25, -2.5, -3.5, -4.25, -5.5] },
];
export const POPULAR_PRESETS = 8;

/** Basic mode's three controls, each a weighted region of the ten bands. */
export const BASIC_CONTROLS = [
  { id: 'bass', label: 'Bass', detail: 'Kick, bass guitar, 808s', weights: [1, 1, 0.75, 0.4, 0.1, 0, 0, 0, 0, 0] },
  { id: 'mid', label: 'Vocals', detail: 'Voices, guitars, keys', weights: [0, 0, 0.1, 0.4, 0.8, 1, 0.8, 0.4, 0.1, 0] },
  { id: 'treble', label: 'Treble', detail: 'Cymbals, air, detail', weights: [0, 0, 0, 0, 0, 0.1, 0.4, 0.75, 1, 1] },
] as const;

export const clampDb = (v: number) => Math.max(EQ_MIN, Math.min(EQ_MAX, Math.round(v * 2) / 2));

export function basicValue(bands: number[], weights: readonly number[]): number {
  let sum = 0;
  let w = 0;
  weights.forEach((k, i) => {
    sum += k * (bands[i] ?? 0);
    w += k;
  });
  return Math.round((sum / w) * 2) / 2;
}

/** Moves one basic control to `value`, shifting its bands by their weights. */
export function setBasic(bands: number[], weights: readonly number[], value: number): number[] {
  const delta = value - basicValue(bands, weights);
  return bands.map((b, i) => clampDb(b + delta * (weights[i] ?? 0)));
}

export function presetName(eq: EqSettings): string {
  if (eq.preset.startsWith('custom:')) return eq.preset.slice(7);
  return EQ_PRESETS.find((p) => p.id === eq.preset)?.name ?? 'Custom';
}

/** The level change applied before the filters, in dB. */
export function preampFor(eq: EqSettings): number {
  return eq.autoPreamp ? -Math.max(0, ...eq.bands) : eq.preamp;
}

const isFlat = (eq: EqSettings) => eq.bands.every((b) => b === 0) && preampFor(eq) === 0;

// ---- The audio graph ------------------------------------------------------------------

type Graph = {
  ctx: AudioContext;
  bus: GainNode;
  preamp: GainNode;
  filters: BiquadFilterNode[];
  /** After the equalizer (or straight from the decks): into Spatial Audio, or to the output. */
  post: GainNode;
  out: GainNode;
  meter: AnalyserNode;
  routed: 'direct' | 'eq' | null;
  spatial: { node: AudioNode; mode: SpatialAudio } | null;
};

let elements: readonly HTMLAudioElement[] = [];
let graph: Graph | null = null;

const dbToGain = (db: number) => 10 ** (db / 20);

function build() {
  const ctx = new AudioContext({ latencyHint: 'playback' });
  const bus = ctx.createGain();
  const preamp = ctx.createGain();
  const filters = EQ_FREQUENCIES.map((f) => {
    const node = ctx.createBiquadFilter();
    node.type = 'peaking';
    node.frequency.value = f;
    node.Q.value = Q;
    node.gain.value = 0;
    return node;
  });
  const post = ctx.createGain();
  // `out` is a unity gain (an exact ×1.0) so a meter can listen without touching the signal.
  const out = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 8192;
  meter.smoothingTimeConstant = 0; // each reading stands alone
  out.connect(ctx.destination);
  out.connect(meter);
  preamp.connect(filters[0]!);
  for (let i = 0; i < filters.length - 1; i++) filters[i]!.connect(filters[i + 1]!);
  filters[filters.length - 1]!.connect(post);
  post.connect(out);
  // Once an element feeds Web Audio it can't go back, so this only happens when first needed.
  for (const el of elements) ctx.createMediaElementSource(el).connect(bus);
  for (const el of elements) el.addEventListener('play', () => void ctx.resume());
  graph = { ctx, bus, preamp, filters, post, out, meter, routed: null, spatial: null };
}

function route(to: 'direct' | 'eq') {
  if (!graph || graph.routed === to) return;
  graph.bus.disconnect();
  graph.bus.connect(to === 'eq' ? graph.preamp : graph.post);
  graph.routed = to;
}

// ---- Spatial Audio --------------------------------------------------------------------

/** A short, soft room: decaying noise, darker as it fades, slightly different in each ear. */
function roomImpulse(ctx: BaseAudioContext, seconds = 0.55): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // A one-pole lowpass that closes as the tail goes on: early reflections bright, the tail warm.
      const k = 0.65 - 0.5 * t;
      smooth = smooth * (1 - k) + (Math.random() * 2 - 1) * k;
      data[i] = smooth * (1 - t) ** 3;
    }
    // Unit energy: the room adds its level (set where it's used) and no more.
    const energy = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < length; i++) data[i]! /= energy;
  }
  return buffer;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = Math.SQRT1_2;
  return node;
}

/** A speaker placed at `degrees` around the listener (0 ahead, negative to the left), heard through HRTF. */
function virtualSpeaker(ctx: BaseAudioContext, degrees: number, elevation = 0) {
  const p = ctx.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'linear';
  p.rolloffFactor = 0; // placement only: no level change with distance
  const a = (degrees * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  p.positionX.value = Math.sin(a) * Math.cos(e);
  p.positionY.value = Math.sin(e);
  p.positionZ.value = -Math.cos(a) * Math.cos(e);
  return p;
}

/**
 * Evens out what the virtual speakers do to the tone (measured octave by octave on music-like
 * signals): HRTF colours the sound, and the speakers' paths to each ear add up unevenly.
 */
const HEADPHONE_CORRECTION: [frequency: number, gain: number, q: number][] = [
  [190, -4, 0.9],
  [1250, 4, 1.1],
  [8500, 6.5, 1.6],
];

/**
 * Headphones: the music moves out of your head onto speakers around you. Each side plays from a
 * front speaker at ±30° and, quieter and a little later, from one behind at ±110°, all through
 * HRTF, with a touch of room.
 */
function headphoneStage(ctx: BaseAudioContext, input: AudioNode, output: AudioNode) {
  const split = ctx.createChannelSplitter(2);
  input.connect(split);
  const wet = ctx.createGain();
  wet.gain.value = 0.7;
  for (const [channel, side] of [
    [0, -1],
    [1, 1],
  ] as const) {
    split.connect(virtualSpeaker(ctx, side * 30, 5), channel).connect(wet);
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.014;
    const rear = ctx.createGain();
    rear.gain.value = 0.3;
    split.connect(delay, channel).connect(rear).connect(virtualSpeaker(ctx, side * 110)).connect(wet);
  }
  let voiced: AudioNode = wet;
  for (const [frequency, gain, q] of HEADPHONE_CORRECTION) {
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = frequency;
    peak.gain.value = gain;
    peak.Q.value = q;
    voiced = voiced.connect(peak);
  }
  voiced.connect(output);
  const room = ctx.createConvolver();
  room.normalize = false;
  room.buffer = roomImpulse(ctx);
  const roomLevel = ctx.createGain();
  roomLevel.gain.value = 0.11;
  voiced.connect(room).connect(roomLevel).connect(output);
}

/**
 * Speakers: a wider stage. The difference between the channels (what's at the sides) is lifted
 * above 200 Hz; the middle (bass, vocals) is untouched. A touch of room adds depth.
 */
function speakerStage(ctx: BaseAudioContext, input: AudioNode, output: AudioNode) {
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  input.connect(split);
  const mid = ctx.createGain();
  const side = ctx.createGain();
  const half = (channel: 0 | 1, to: AudioNode, sign: 1 | -1) => {
    const g = ctx.createGain();
    g.gain.value = 0.5 * sign;
    split.connect(g, channel).connect(to);
  };
  half(0, mid, 1);
  half(1, mid, 1);
  half(0, side, 1);
  half(1, side, -1);
  // The original sides, plus extra width above 200 Hz.
  const extra = ctx.createGain();
  extra.gain.value = 0.7;
  const wide = ctx.createGain();
  side.connect(wide);
  side.connect(filter(ctx, 'highpass', 200)).connect(extra).connect(wide);
  const flip = ctx.createGain();
  flip.gain.value = -1;
  mid.connect(merge, 0, 0);
  mid.connect(merge, 0, 1);
  wide.connect(merge, 0, 0);
  wide.connect(flip).connect(merge, 0, 1);
  merge.connect(output);
  const room = ctx.createConvolver();
  room.normalize = false;
  room.buffer = roomImpulse(ctx, 0.4);
  const roomLevel = ctx.createGain();
  roomLevel.gain.value = 0.07;
  merge.connect(room).connect(roomLevel).connect(output);
}

/** Puts Spatial Audio after the equalizer, or takes it out of the path entirely when off. */
function applySpatial(mode: SpatialAudio) {
  const g = graph!;
  if ((g.spatial?.mode ?? 'off') === mode) return;
  g.post.disconnect();
  g.spatial?.node.disconnect();
  g.spatial = null;
  if (mode === 'off') {
    g.post.connect(g.out);
    return;
  }
  const input = g.ctx.createGain();
  // A safety limiter: the virtual speakers and room add a little level on loud, wide passages.
  const limiter = g.ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  (mode === 'headphones' ? headphoneStage : speakerStage)(g.ctx, input, limiter);
  limiter.connect(g.out);
  g.post.connect(input);
  g.spatial = { node: input, mode };
}

/** The equalizer and Spatial Audio, as the settings say. */
export function applyAudio(eq: EqSettings, spatial: SpatialAudio = 'off') {
  if (!graph && !eq.enabled && spatial === 'off') return; // never used: the untouched path
  if (!graph) build();
  const g = graph!;
  const now = g.ctx.currentTime;
  if (!eq.enabled || isFlat(eq)) {
    route('direct');
  } else {
    g.filters.forEach((f, i) => f.gain.setTargetAtTime(eq.bands[i] ?? 0, now, 0.03));
    g.preamp.gain.setTargetAtTime(dbToGain(preampFor(eq)), now, 0.03);
    route('eq');
  }
  applySpatial(spatial);
  if (elements.some((el) => !el.paused)) void g.ctx.resume();
}

/** Called once by the player with its two decks. */
export function attachEqualizer(decks: readonly HTMLAudioElement[]) {
  elements = decks;
  let last: [EqSettings | undefined, SpatialAudio | undefined] = [undefined, undefined];
  const sync = () => {
    const { eq, spatialAudio } = useLibrary.getState().settings;
    if (eq && (eq !== last[0] || spatialAudio !== last[1])) {
      last = [eq, spatialAudio];
      applyAudio(eq, spatialAudio ?? 'off');
    }
  };
  useLibrary.subscribe(sync);
  sync();
}

/** Level at the output (dB) at a few frequencies, for the self-test. */
function measure(freqs: number[]): { rms: number; bands: Record<number, number> } | null {
  if (!graph) return null;
  const { meter, ctx } = graph;
  const time = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(time);
  const rms = Math.sqrt(time.reduce((a, v) => a + v * v, 0) / time.length);
  const spec = new Float32Array(meter.frequencyBinCount);
  meter.getFloatFrequencyData(spec);
  const bands: Record<number, number> = {};
  for (const f of freqs) {
    const bin = Math.round((f / (ctx.sampleRate / 2)) * spec.length);
    bands[f] = Math.max(...spec.slice(Math.max(0, bin - 2), bin + 3));
  }
  return { rms, bands };
}
(window as unknown as { __obsidianEq: unknown }).__obsidianEq = { path: () => eqPath(), measure, stages: { headphones: headphoneStage, speakers: speakerStage } };

/** For tests and the readout: what the audio is going through right now. */
export function eqPath(): { path: 'native' | 'direct' | 'eq'; spatial?: SpatialAudio; sampleRate?: number } {
  if (!graph) return { path: 'native' };
  return { path: graph.routed ?? 'direct', spatial: graph.spatial?.mode ?? 'off', sampleRate: graph.ctx.sampleRate };
}

// ---- The curve on screen --------------------------------------------------------------

let curveCtx: OfflineAudioContext | null = null;
let curveFilters: BiquadFilterNode[] = [];

/** The equalizer's real frequency response (dB) at `freqs`, from the same filters. */
export function responseCurve(eq: EqSettings, freqs: Float32Array<ArrayBuffer>): Float32Array {
  if (!curveCtx) {
    curveCtx = new OfflineAudioContext(1, 128, 48000);
    curveFilters = EQ_FREQUENCIES.map((f) => {
      const n = curveCtx!.createBiquadFilter();
      n.type = 'peaking';
      n.frequency.value = f;
      n.Q.value = Q;
      return n;
    });
  }
  const total = new Float32Array(freqs.length).fill(preampFor(eq));
  const mag = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  curveFilters.forEach((f, i) => {
    f.gain.value = eq.bands[i] ?? 0;
    f.getFrequencyResponse(freqs, mag, phase);
    for (let k = 0; k < freqs.length; k++) total[k]! += 20 * Math.log10(mag[k]!);
  });
  return total;
}
