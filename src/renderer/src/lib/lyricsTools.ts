/*
 * Lyric translation and pronunciation.
 *
 * Translation: Google Translate (the same free endpoint am-lyrics used), with
 * three fixes for lyrics that came out wrong or missing before:
 *  - The source language is given when the script says what it is (Malayalam,
 *    Tamil, Hindi…) instead of being guessed from a line or two.
 *  - Lines can't shift onto the wrong lyric: a batch whose answer doesn't have
 *    exactly one line per lyric is split and retried, down to single lines.
 *  - Repeated lines (choruses) are translated once, and results are cached.
 *
 * Pronunciation: lib/romanize.ts for Indian scripts (offline), Google's
 * romanization for other non-Latin scripts.
 */
import { indicScript, isLatin, romanizeIndic, SCRIPT_LANG } from './romanize';

const API = 'https://translate.googleapis.com/translate_a/single?client=gtx';
const cache = new Map<string, string>();

export const TRANSLATE_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'ta', name: 'Tamil' },
  { code: 'te', name: 'Telugu' },
  { code: 'kn', name: 'Kannada' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'ur', name: 'Urdu' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'ar', name: 'Arabic' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese' },
];

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error(`translate ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** The language of a set of lines, from the script they're written in (null: let Google detect). */
export function sourceLanguage(lines: string[]): string | null {
  const script = indicScript(lines.join(' '));
  if (script) return SCRIPT_LANG[script];
  const text = lines.join(' ');
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[؀-ۿ]/.test(text)) return null; // Arabic or Urdu: let Google tell
  return null;
}

async function translateBatch(lines: string[], target: string, source: string | null): Promise<string[]> {
  const q = lines.join('\n');
  const data = (await fetchJson(`${API}&sl=${source ?? 'auto'}&tl=${target}&dt=t&q=${encodeURIComponent(q)}`)) as [[string, string][]];
  const out = (data?.[0] ?? []).map((seg) => seg?.[0] ?? '').join('').split('\n');
  if (out.length === lines.length) return out.map((s) => s.trim());
  // Misaligned: halve until each answer matches its lyric.
  if (lines.length === 1) return [out.join(' ').trim()];
  const mid = Math.ceil(lines.length / 2);
  return [...(await translateBatch(lines.slice(0, mid), target, source)), ...(await translateBatch(lines.slice(mid), target, source))];
}

/** Translations for each line ('' for empty lines and lines already in the target language). */
export async function translateLines(lines: string[], target: string): Promise<string[]> {
  const source = sourceLanguage(lines);
  const key = (l: string) => `${target}|${l}`;
  const todo = [...new Set(lines.map((l) => l.trim()).filter((l) => l && !cache.has(key(l))))];
  // ~1500 characters per request keeps the URL under Google's limit.
  const batches: string[][] = [];
  let batch: string[] = [];
  let size = 0;
  for (const l of todo) {
    if (size + l.length > 1500 && batch.length) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(l);
    size += l.length + 1;
  }
  if (batch.length) batches.push(batch);
  for (const b of batches) {
    const result = await translateBatch(b, target, source);
    b.forEach((l, i) => cache.set(key(l), result[i] ?? ''));
  }
  return lines.map((l) => {
    const t = cache.get(key(l.trim())) ?? '';
    return t && t.toLowerCase() !== l.trim().toLowerCase() ? t : '';
  });
}

/**
 * A line as its sound in plain letters, for matching a lyric to a translation's line: Indian
 * scripts read into Latin letters, then the spellings people vary folded together (Senkaan,
 * Sengan; Thiruvadi, Tiruvadi; Kaarkuzhal, Karkuzhal; love, lav).
 */
function sound(line: string): string {
  const script = indicScript(line);
  const latin = script ? romanizeIndic(line, script) : line;
  return latin
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
    .replace(/h/g, '')
    .replace(/w/g, 'v')
    .replace(/[gk]/g, 'k')
    .replace(/[dt]/g, 't')
    .replace(/[bp]/g, 'p')
    // Vowels are where spellings differ most (love, lav; mein, men; taaron, taro): one sound for all.
    .replace(/[aeiouy]+/g, 'a')
    .replace(/(.)\1+/g, '$1');
}

/** A sound's letter pairs, counted. */
function letterPairs(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
  return m;
}

/** Letter pairs two sounds share. */
function shared(a: Map<string, number>, b: Map<string, number>): number {
  let n = 0;
  for (const [k, c] of a) n += Math.min(c, b.get(k) ?? 0);
  return n;
}

/** What laying a person's translation onto the lyrics gave each lyric line. */
export interface AlignedTranslation {
  /** The meaning to show under each line ('' for none). */
  text: string[];
  /**
   * Lines the translation covers without a meaning of their own: the later parts of one of its
   * sentences that the lyrics break over several lines (the meaning shows on the first part).
   */
  covered: boolean[];
}

/**
 * A person's translation laid onto the lyrics. Each lyric line gets the meaning of the translation's
 * line that sounds like it. The translation often joins two or three sung lines into one sentence; then
 * the run of lines it contains shows the meaning once, on its first line. Lines no translation line
 * sounds like are left for machine translation.
 */
export function alignTranslation(lines: string[], pairs: { original: string; english: string }[]): AlignedTranslation {
  const known = pairs.map((p) => {
    const s = sound(p.original);
    return { sound: s, pairs: letterPairs(s), english: p.english };
  });
  // The translation line each lyric line belongs to (-1: none). Songs run in order, so a short line
  // that could be in several sentences goes with the one the line before was in, or the next one.
  const owner: number[] = [];
  let previous = -1;
  for (const line of lines) {
    const s = sound(line.trim());
    if (s.length < 3) {
      owner.push(-1);
      continue;
    }
    const mine = letterPairs(s);
    const size = s.length - 1;
    let best = { index: -1, score: 0 };
    known.forEach((k, index) => {
      const both = shared(mine, k.pairs);
      // The same line…
      const whole = (2 * both) / Math.max(1, size + k.sound.length - 1);
      // …or a part of a longer one (long enough to tell: a word or two could be anywhere).
      const part = s.length >= 8 && k.sound.length > s.length ? both / size : 0;
      let score = Math.max(whole >= 0.6 ? whole : 0, part >= 0.8 ? part * 0.95 : 0);
      if (score && previous >= 0 && (index === previous || index === previous + 1)) score += 0.2;
      // The very line, sung again (a chorus), wins over going on in order.
      if (whole >= 0.9) score += 0.25;
      // A translation repeats its choruses: of copies that fit as well, the next one on.
      const ahead = (i: number) => (i > previous ? i - previous : i + known.length);
      if (score > best.score + 1e-9 || (score > 0 && Math.abs(score - best.score) <= 1e-9 && ahead(index) < ahead(best.index))) best = { index, score };
    });
    owner.push(best.index);
    previous = best.index;
  }
  const text: string[] = [];
  const covered: boolean[] = [];
  owner.forEach((k, i) => {
    // The next part of the same sentence (not the same line sung again) shows nothing of its own.
    const continues = k >= 0 && i > 0 && owner[i - 1] === k && sound(lines[i]!) !== sound(lines[i - 1]!);
    text.push(k >= 0 && !continues ? known[k]!.english : '');
    covered.push(continues);
  });
  return { text, covered };
}

/** What pronunciation can do for these lyrics. */
export function pronunciationKind(lines: string[]): 'indic' | 'online' | 'none' {
  const text = lines.join(' ');
  if (indicScript(text)) return 'indic';
  return isLatin(text) ? 'none' : 'online';
}

/** Pronunciation for each line ('' where the line is already in Latin letters). */
export async function romanizeLines(lines: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isLatin(trimmed)) {
      out.push('');
      continue;
    }
    const script = indicScript(trimmed);
    if (script) {
      out.push(romanizeIndic(trimmed, script));
      continue;
    }
    const k = `rm|${trimmed}`;
    if (!cache.has(k)) {
      try {
        const data = (await fetchJson(`${API}&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(trimmed)}`)) as unknown[][][];
        cache.set(k, String(data?.[0]?.[0]?.[3] ?? ''));
      } catch {
        cache.set(k, '');
      }
    }
    out.push(cache.get(k)!);
  }
  return out;
}
