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
