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
import { wordSound } from '../../../shared/wordSound';

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
 * A line as the sounds of its words, for matching a lyric to a translation's line: Indian scripts read
 * into Latin letters, then the spellings people vary folded together (Senkaan, Sengan; Thiruvadi,
 * Tiruvadi; Kaarkuzhal, Karkuzhal; love, lav).
 */
function wordSounds(line: string): string[] {
  const script = indicScript(line);
  const latin = script ? romanizeIndic(line, script) : line;
  return latin
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(wordSound);
}

/** A sound's letter pairs, counted. */
function letterPairs(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
  return m;
}

/** How alike two sounds are, 0–1 (letter pairs they share). */
function likeness(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pa = letterPairs(a);
  const pb = letterPairs(b);
  let n = 0;
  for (const [k, c] of pa) n += Math.min(c, pb.get(k) ?? 0);
  return (2 * n) / (a.length - 1 + b.length - 1);
}

/** What laying a person's translation onto the lyrics gave each lyric line. */
export interface AlignedTranslation {
  /**
   * The meaning to show under each line: '' where the translation lacks the line, or where its
   * sentence couldn't be shared out that far (both are left for machine translation).
   */
  text: string[];
  /** The lines the translation has (whether or not its sentence could be shared out to them). */
  matched: boolean[];
}

/** Words a meaning can break before: where a new clause starts. */
const JOINS = new Set(['and', 'but', 'or', 'so', 'as', 'while', 'when', 'whenever', 'till', 'until', 'because', 'if', 'then', 'yet', 'where', 'before', 'after']);

/**
 * One sentence's meaning shared out over the sung lines it runs over, each line taking about its share
 * of the sentence (by how much it sings), broken where the sentence pauses (after a comma, semicolon or
 * dash) or a clause starts (before "and", "but", "when"…), a pause preferred. Where it can't be broken
 * near enough, the first line shows it all and the rest get nothing from it ('').
 */
function shareOut(meaning: string, sizes: number[]): string[] {
  const words = meaning.split(/\s+/).filter(Boolean);
  if (sizes.length === 1) return [meaning];
  // Where it can break: before word i, with how strongly it pauses there.
  const breaks: { at: number; pause: boolean }[] = [];
  for (let i = 1; i < words.length; i++) {
    const pause = /[,;:–—]$/.test(words[i - 1]!) || /^[–—]$/.test(words[i]!);
    if (pause || JOINS.has(words[i]!.toLowerCase().replace(/[^a-z]/g, ''))) breaks.push({ at: i, pause });
  }
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  const targets = sizes.slice(0, -1).map((_, j) => (words.length * sizes.slice(0, j + 1).reduce((a, b) => a + b, 0)) / total);
  const near = Math.max(3, words.length * 0.3);
  // The breaks, in order, closest to each line's share (a pause counts as a word nearer).
  let best: { cost: number; at: number[] } | null = null;
  const pick = (j: number, from: number, at: number[], cost: number) => {
    if (j === targets.length) {
      if (!best || cost < best.cost) best = { cost, at };
      return;
    }
    for (let b = from; b < breaks.length; b++) {
      const off = Math.abs(breaks[b]!.at - targets[j]!);
      if (off <= near) pick(j + 1, b + 1, [...at, breaks[b]!.at], cost + off - (breaks[b]!.pause ? 1 : 0));
    }
  };
  pick(0, 0, [], 0);
  const found = best as { cost: number; at: number[] } | null;
  if (!found) return [meaning];
  const edges = [0, ...found.at, words.length];
  return sizes.map((_, j) => words.slice(edges[j], edges[j + 1]).join(' '));
}

/** Whether a line only sings words of the line before (a phrase sung again, not the sentence going on). */
const repeats = (words: string[], before: string[]) => words.length > 0 && words.every((w) => among(w, before));

/** Whether a word is among others: the same sound, or (long enough to tell) nearly. */
const among = (word: string, others: string[]) => others.some((x) => x === word || (word.length >= 3 && x.length >= 3 && likeness(word, x) >= 0.75));

/**
 * How alike a line's letters are to the closest run of a longer line's words, for when the two split
 * words differently (Vaa Naadhane, Vaanadhane): 0 for lines too short to tell.
 */
function partLetters(words: string[], longer: string[]): number {
  const mine = words.join('');
  if (mine.length < 10) return 0;
  let best = 0;
  for (let from = 0; from < longer.length; from++)
    for (let to = from + Math.max(1, words.length - 1); to <= Math.min(longer.length, from + words.length + 1); to++) best = Math.max(best, likeness(mine, longer.slice(from, to).join('')));
  return best >= 0.8 ? best : 0;
}

/** How many of a line's words are among another's. */
const wordsAmong = (words: string[], others: string[]) => words.filter((w) => among(w, others)).length;

/**
 * A person's translation laid onto the lyrics. Each lyric line gets the meaning of the translation's
 * line it sings, judged word by word. The lyrics and the translation break lines differently: a sung
 * line can hold two or three of the translation's lines (their meanings are joined), and one of the
 * translation's sentences can run over several sung lines (its meaning is shared out over them, each
 * taking about its share). Lines the translation lacks, or that its meaning can't be shared out to, are left for
 * machine translation.
 */
export function alignTranslation(lines: string[], pairs: { original: string; english: string }[]): AlignedTranslation {
  const single = pairs.map((p) => wordSounds(p.original));
  // Each translation line, and each run of two or three of them, as something a sung line can be.
  const known: { words: string[]; english: string; first: number; last: number }[] = [];
  for (let first = 0; first < pairs.length; first++)
    for (let last = first; last < Math.min(pairs.length, first + 3); last++)
      known.push({
        words: single.slice(first, last + 1).flat(),
        english: pairs
          .slice(first, last + 1)
          .map((p) => p.english)
          .join(' '),
        first,
        last,
      });
  const sounds = lines.map((l) => wordSounds(l.trim()));
  // What each lyric line sings (-1: none). Songs run in order, so a short line that could be in several
  // sentences goes with the one the line before was in, or the next one.
  const owner: number[] = [];
  let previous = -1;
  for (const words of sounds) {
    if (words.join('').length < 3) {
      owner.push(-1);
      continue;
    }
    let best = { index: -1, score: 0 };
    known.forEach((k, index) => {
      // The same words, both ways, or (spelled further apart: Kesriya, Kesariya) nearly the same
      // letters all through…
      const mine = wordsAmong(words, k.words) / words.length;
      const theirs = wordsAmong(k.words, words) / k.words.length;
      const letters = likeness(words.join(''), k.words.join(''));
      const whole = Math.max(mine && theirs ? (2 * mine * theirs) / (mine + theirs) : 0, letters >= 0.8 ? letters : 0);
      // …or a part of one longer line (not words found here and there over several): most of its
      // words, two or more and one of them long enough to tell, are in it.
      const part = k.first === k.last && words.length >= 2 && k.words.length > words.length && words.some((w) => w.length >= 4 && among(w, k.words)) ? Math.max(mine, partLetters(words, k.words)) : 0;
      let score = Math.max(whole >= 0.7 ? whole : 0, part >= 0.7 ? part * 0.9 : 0);
      if (!score) return;
      // One translation line fitting beats a run of them that fits as well.
      score -= (k.last - k.first) * 0.05;
      const order = previous >= 0 ? known[previous]!.last : -1;
      if (order >= 0 && (k.first === known[previous]!.first || k.first === order + 1)) score += 0.2;
      // The very line, sung again (a chorus), wins over going on in order.
      if (whole >= 0.9) score += 0.25;
      // A translation repeats its choruses: of copies that fit as well, the next one on.
      const ahead = (i: number) => (known[i]!.first > order ? known[i]!.first - order : known[i]!.first + pairs.length);
      if (score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && ahead(index) < ahead(best.index))) best = { index, score };
    });
    owner.push(best.index);
    if (best.index >= 0) previous = best.index;
  }
  const text: string[] = lines.map(() => '');
  const matched: boolean[] = lines.map(() => false);
  for (let i = 0; i < lines.length; ) {
    const k = owner[i]!;
    // The run of lines that are parts of the same sentence (not the same words sung again).
    let end = i + 1;
    while (k >= 0 && end < lines.length && owner[end] === k && !repeats(sounds[end]!, sounds[end - 1]!)) end++;
    if (k >= 0) {
      const shares = shareOut(
        known[k]!.english,
        sounds.slice(i, end).map((w) => w.join('').length),
      );
      for (let j = i; j < end; j++) {
        text[j] = shares[j - i] ?? '';
        matched[j] = true;
      }
    }
    i = end;
  }
  return { text, matched };
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
