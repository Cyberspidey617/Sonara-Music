/*
 * Pronunciation (romanization) for lyrics, done on this PC so it works for
 * every Indian script, offline and instantly:
 *
 *  - Hindi, Marathi, Punjabi, Gujarati, Bengali, Odia, Telugu, Kannada,
 *    Malayalam: Sanscript (ISO 15919), then made readable the way people
 *    write these languages in Latin letters ("kiliye kiliye", "kehta hai").
 *    Hindi-family scripts drop the silent inherent "a" (schwa deletion).
 *  - Tamil: its own table, since Tamil letters don't mark voicing.
 *  - Other scripts (Japanese, Korean, Chinese, Arabic, Cyrillic…): Google's
 *    romanization, as before.
 */
import Sanscript from '@indic-transliteration/sanscript';

type Script = 'devanagari' | 'bengali' | 'gurmukhi' | 'gujarati' | 'oriya' | 'telugu' | 'kannada' | 'malayalam' | 'tamil';

const RANGES: [Script, number, number][] = [
  ['devanagari', 0x0900, 0x097f],
  ['bengali', 0x0980, 0x09ff],
  ['gurmukhi', 0x0a00, 0x0a7f],
  ['gujarati', 0x0a80, 0x0aff],
  ['oriya', 0x0b00, 0x0b7f],
  ['tamil', 0x0b80, 0x0bff],
  ['telugu', 0x0c00, 0x0c7f],
  ['kannada', 0x0c80, 0x0cff],
  ['malayalam', 0x0d00, 0x0d7f],
];

/** The Indic script most of the text is in, if any. */
export function indicScript(text: string): Script | null {
  const counts = new Map<Script, number>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    for (const [s, a, b] of RANGES) if (c >= a && c <= b) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: Script | null = null;
  let n = 0;
  for (const [s, k] of counts) if (k > n) (best = s), (n = k);
  return best;
}

/** True when there's nothing to romanize (Latin letters, numbers, punctuation). */
export const isLatin = (text: string) => !/[^\u0000-ɏḀ-ỿ -⁯\s]/.test(text);

/** The language a script most likely is, for translation hints. */
export const SCRIPT_LANG: Record<Script, string> = {
  devanagari: 'hi',
  bengali: 'bn',
  gurmukhi: 'pa',
  gujarati: 'gu',
  oriya: 'or',
  tamil: 'ta',
  telugu: 'te',
  kannada: 'kn',
  malayalam: 'ml',
};

// ---- Hindi-family schwa deletion, on ISO 15919 text ---------------------------------------

const VOWELS = ['ai', 'au', 'ā', 'ī', 'ū', 'r̥̄', 'r̥', 'l̥', 'ē', 'ō', 'a', 'i', 'u', 'e', 'o'];
function tokens(word: string): { t: string; v: boolean }[] {
  const out: { t: string; v: boolean }[] = [];
  let i = 0;
  while (i < word.length) {
    const v = VOWELS.find((x) => word.startsWith(x, i));
    if (v) {
      out.push({ t: v, v: true });
      i += v.length;
      continue;
    }
    // A consonant letter with its diacritics (ṭ, ḍh, ñ…), or a mark like ṁ / ḥ.
    let j = i + 1;
    while (j < word.length && /[̀-ͯ]/.test(word[j]!)) j++;
    if (word[j] === 'h' && /[kgcjṭḍtdpbr]/.test(word[i]!)) j++;
    out.push({ t: word.slice(i, j), v: false });
    i = j;
  }
  return out;
}
function deleteSchwa(word: string): string {
  const t = tokens(word);
  const vowelCount = t.filter((x) => x.v).length;
  if (vowelCount < 2) return word;
  const isC = (k: number) => k >= 0 && k < t.length && !t[k]!.v && !/^[ṁṃḥ̃]$/.test(t[k]!.t);
  // Word-final: "prēma" → "prēm", "bhara" → "bhar".
  if (t.at(-1)?.t === 'a' && isC(t.length - 2)) t.pop();
  // Medial V C a C V: "kahatā" → "kahtā", "hamasē" → "hamsē" (right to left).
  for (let k = t.length - 2; k >= 2; k--) {
    if (t[k]!.t === 'a' && isC(k - 1) && t[k - 2]!.v && isC(k + 1) && t[k + 2]?.v) t.splice(k, 1);
  }
  return t.map((x) => x.t).join('');
}

// ---- Readable Latin ------------------------------------------------------------------

const READABLE: [RegExp, string][] = [
  [/ch/g, 'chh'], // ISO "ch" is the aspirated one…
  [/c(?!hh)/g, 'ch'], // …and plain "c" is "ch"
  [/ṅ/g, 'ng'],
  [/ñ/g, 'nj'],
  [/ṇ/g, 'n'],
  [/[śṣ]/g, 'sh'],
  [/ḻ/g, 'zh'],
  [/ṟ/g, 'r'],
  [/[ṁṃ](?=[pbm])/g, 'm'], // the nasal sound takes the next letter's place…
  [/[ṁṃ]/g, 'n'], // …and is usually written "n" ("mein", "kahin")
  [/m̐/g, 'n'],
  [/ḥ/g, 'h'],
  [/r̥̄|r̥/g, 'ri'],
  [/ā/g, 'aa'],
  [/ī/g, 'ee'],
  [/ū/g, 'oo'],
  [/ē/g, 'e'],
  [/ō/g, 'o'],
];
function readable(iso: string, longVowels: boolean): string {
  let s = iso;
  for (const [re, to] of READABLE) {
    if (!longVowels && (to === 'aa' || to === 'ee' || to === 'oo')) s = s.replace(re, { aa: 'a', ee: 'i', oo: 'u' }[to]!);
    else s = s.replace(re, to);
  }
  // Remaining accents (ṭ ḍ ḷ ẏ…) to their plain letters.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

// ---- Tamil ---------------------------------------------------------------------------

const TA_CONS: Record<string, string> = {
  க: 'k', ங: 'ng', ச: 'ch', ஞ: 'nj', ட: 't', ண: 'n', த: 'th', ந: 'n', ப: 'p', ம: 'm', ய: 'y', ர: 'r', ல: 'l', வ: 'v', ழ: 'zh', ள: 'l', ற: 'r', ன: 'n',
  ஜ: 'j', ஷ: 'sh', ஸ: 's', ஹ: 'h', க்ஷ: 'ksh',
};
const TA_VOWEL: Record<string, string> = { அ: 'a', ஆ: 'aa', இ: 'i', ஈ: 'ee', உ: 'u', ஊ: 'oo', எ: 'e', ஏ: 'e', ஐ: 'ai', ஒ: 'o', ஓ: 'o', ஔ: 'au', ஃ: 'h' };
const TA_SIGN: Record<string, string> = { 'ா': 'aa', 'ி': 'i', 'ீ': 'ee', 'ு': 'u', 'ூ': 'oo', 'ெ': 'e', 'ே': 'e', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au' };
function tamil(text: string): string {
  let out = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (TA_VOWEL[ch]) out += TA_VOWEL[ch];
    else if (TA_CONS[ch]) {
      let c = TA_CONS[ch]!;
      const next = chars[i + 1];
      // Spoken Tamil voices some stops between vowels and after nasals: "kathal", "pandhu".
      const prev = out.at(-1) ?? ' ';
      const afterVowel = /[aeiou]/.test(prev);
      const afterNasal = /n$|m$|ng$/.test(out) && !/[aeiou]$/.test(out);
      if (ch === 'க' && afterVowel) c = 'g';
      if (ch === 'ட' && (afterVowel || afterNasal)) c = 'd';
      if (ch === 'த' && afterNasal) c = 'dh';
      if (ch === 'ப' && (afterVowel || afterNasal)) c = 'b';
      if (ch === 'ச' && afterVowel) c = 's';
      if (next === '்') {
        out += c;
        i++;
        // Doubled stops stay hard: "paarththen".
        continue;
      }
      if (next && TA_SIGN[next]) {
        out += c + TA_SIGN[next];
        i++;
      } else out += c + 'a';
    } else if (TA_SIGN[ch] || ch === '்') {
      /* stray sign */
    } else out += ch;
  }
  return out;
}

// ---- Malayalam chillu letters (word-final consonants) ---------------------------------

const CHILLU: Record<string, string> = { 'ൺ': 'ണ്', 'ൻ': 'ന്', 'ർ': 'ര്', 'ൽ': 'ല്', 'ൾ': 'ള്', 'ൿ': 'ക്', 'ൔ': 'മ്', 'ൕ': 'യ്', 'ൖ': 'ഴ്' };

/** Romanizes one line written in an Indian script; other text is returned unchanged. */
export function romanizeIndic(line: string, script: Script): string {
  if (script === 'tamil') return tamil(line);
  let src = line;
  if (script === 'malayalam') src = src.replace(/[ൺൻർൽൾൿൔൕൖ]/g, (c) => CHILLU[c] ?? c);
  const iso = Sanscript.t(src, script, 'iso');
  const schwa = script === 'devanagari' || script === 'gurmukhi' || script === 'gujarati';
  const words = iso.split(/(\s+|[,.!?;:'"()[\]-]+)/);
  const fixed = words
    .map((w) => {
      if (!/\p{L}/u.test(w)) return w;
      if (schwa) return deleteSchwa(w);
      // Bengali drops only the word-final inherent vowel ("tomara" → "tomar").
      if (script === 'bengali' && /[aeiouāīūēō][^aeiouāīūēō\s]a$/.test(w)) return w.slice(0, -1);
      return w;
    })
    .join('');
  // Dravidian languages keep long vowels distinct ("kaathal") and end words on "m" ("pokum");
  // Hindi and Bengali spellings usually don't double vowels.
  const dravidian = script === 'malayalam' || script === 'telugu' || script === 'kannada';
  return readable(dravidian ? fixed.replace(/[ṁṃ](?=$|[\s,.!?;:'")\]-])/g, 'm') : fixed, dravidian);
}
