/*
 * Whether a video is the same recording as a song: the title with its packaging taken off ("(From
 * …)", "Official Video", "Artist - "), the take it is (remix, live, cover…, which must agree both
 * ways), the song's artist credited on the video, and a length within 90 s (a music video runs
 * longer for its intro and outro). Strict on purpose: no video is better than the wrong one.
 */

export interface MatchTarget {
  title: string;
  artists: string[];
  /** Seconds. */
  duration?: number;
  /** The release it's on, when known: tells same-titled releases apart. */
  album?: string;
  /** Explicit or clean edition, when known. */
  explicit?: boolean;
}

export interface MatchCandidate {
  title: string;
  artists: string[];
  duration?: number;
  album?: string;
  explicit?: boolean;
}

/** Hiragana and katakana to Hepburn romaji, so コイコガレ finds Koi Kogare (and the other way). */
const KANA: Record<string, string> = {};
(() => {
  const rows = 'a i u e o|ka ki ku ke ko|sa shi su se so|ta chi tsu te to|na ni nu ne no|ha hi fu he ho|ma mi mu me mo|ya  yu  yo|ra ri ru re ro|wa   wo|ga gi gu ge go|za ji zu ze zo|da ji zu de do|ba bi bu be bo|pa pi pu pe po'.split('|');
  const kana = 'あいうえお|かきくけこ|さしすせそ|たちつてと|なにぬねの|はひふへほ|まみむめも|や ゆ よ|らりるれろ|わ  を|がぎぐげご|ざじずぜぞ|だぢづでど|ばびぶべぼ|ぱぴぷぺぽ'.split('|');
  rows.forEach((r, i) => {
    const sounds = r.split(' ');
    [...kana[i]!].forEach((k, j) => k !== ' ' && sounds[j] && (KANA[k] = sounds[j]!));
  });
  Object.assign(KANA, { ん: 'n', ゔ: 'vu', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' });
})();
const SMALL_Y: Record<string, string> = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };

/** The romaji reading of any kana in [text]; other characters are kept. */
export function romajiOf(text: string): string {
  // Katakana to hiragana first (same table).
  const hira = [...text].map((c) => (c >= 'ァ' && c <= 'ヶ' ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c));
  let out = '';
  for (let i = 0; i < hira.length; i++) {
    const c = hira[i]!;
    const next = hira[i + 1] ?? '';
    if (c === 'っ') {
      // A doubled consonant: the next sound's first letter twice.
      const n = KANA[next];
      if (n) out += n[0] === 'c' ? 't' : n[0];
      continue;
    }
    if (c === 'ー') continue;
    const base = KANA[c];
    if (base && SMALL_Y[next]) {
      // きゃ → kya, しゃ → sha, ちゃ → cha, じゃ → ja.
      const stem = base.endsWith('i') ? base.slice(0, -1) : base;
      out += (/(sh|ch|j)$/.test(stem) ? stem + SMALL_Y[next]!.slice(1) : stem + SMALL_Y[next]);
      i++;
      continue;
    }
    out += base ?? c;
  }
  return out;
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/;
const LATIN = /[a-z]/;

/** Words that make a listing a different recording, not a different listing of the same one. */
const VERSION_WORDS = new Set([
  'remix', 'remixes', 'rmx', 'refix', 'flip', 'bootleg', 'mashup', 'medley',
  'live', 'concert', 'unplugged', 'acoustic', 'instrumental', 'karaoke',
  'vocals', 'vocal', 'acapella', 'acappella', 'backing', 'stems', 'stem',
  'cover', 'demo', 'reprise', 'remake', 'rework', 'extended', 'edit',
  'version', 'mix', 'dub', 'vip', 'session', 'sessions',
  'sped', 'slowed', 'reverb', 'nightcore', 'lofi', 'orchestral', 'symphonic',
  'part', 'pt', 'chapter', 'reprised', 'unreleased', 'teaser', 'trailer', 'shorts', 'short',
]);
/** Version words that count even bare at the end of a title ("Song Instrumental"). */
const TRAILING_TAKES = new Set(['instrumental', 'karaoke', 'acapella', 'acappella', 'remix', 'rmx', 'nightcore']);
/** Asides that read like a version but describe the ordinary release. */
const NEUTRAL_SEGMENTS = new Set([
  'albumversion', 'originalversion', 'originalmix', 'singleversion', 'radioversion', 'radioedit',
  'stereoversion', 'monoversion', 'studioversion', 'fullversion', 'standardversion', 'explicitversion',
  'deluxeversion', 'originaltrack', 'officialvideoversion', 'videoversion',
]);
/** Labels an upload hangs on the end of a title. */
const TRAILING_NOISE = new Set(['song', 'songs', 'video', 'audio', 'lyrics', 'lyric', 'lyrical', 'official', 'full', 'hd', 'hq', '4k', '8k', 'mp3', 'ost', 'soundtrack', 'mv']);
const NOISE_WORDS = new Set(['official', 'video', 'audio', 'lyrics', 'lyric', 'lyrical', 'visualizer', 'song', 'songs', 'full', 'music', 'the', 'and', 'from', 'feat', 'ft', 'featuring', 'with', 'new', 'latest', 'hd', 'hq', '4k', '8k', 'mv']);
const ARTIST_SEPARATORS = /\s*(?:[,&/;·|、，×]|\band\b|\bx\b|\bvs\.?|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b)\s*/;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Recomposed, so kana keep their voicing marks (が stays が).
    .normalize('NFC')
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
const tokens = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export interface TitleParts {
  /** The title proper, compared exactly. */
  core: string;
  /** The takes it is (remix, live…), compared exactly both ways. */
  versions: Set<string>;
  /** Everything else that was in brackets: only a tie-break. */
  context: Set<string>;
}

function artistNames(credit: string): string[] {
  return normalize(credit)
    .replace(/\s*-\s*topic$/, '')
    .replace(/vevo$/, '')
    .split(ARTIST_SEPARATORS)
    .map((a) => tokens(a.replace(/^the\s+/, '')).join(' '))
    .filter((a) => a.length > 1);
}

/** The same name, however spaced or dotted ("A.R. Rahman", "AR Rahman"): a channel that merely contains it ("Kajal Arijit Singh") is someone else. */
const sameArtist = (a: string, b: string) => a.replace(/ /g, '') === b.replace(/ /g, '');

function isArtistName(text: string, artists: string[]): boolean {
  const t = tokens(normalize(text)).join(' ');
  if (!t) return false;
  const names = artists.flatMap(artistNames);
  return names.some((n) => sameArtist(n, t)) || t.split(/\s*(?:,|&| x | and | feat | ft )\s*/).every((part) => names.some((n) => sameArtist(n, part)));
}

function classify(segment: string, versions: Set<string>, context: Set<string>) {
  const words = tokens(segment);
  if (NEUTRAL_SEGMENTS.has(words.join(''))) return;
  // "feat. Someone" in brackets says who sings, not what take it is.
  if (/^(feat|ft|featuring|with|prod)\b/.test(words[0] ?? '')) return;
  for (const w of words) {
    if (VERSION_WORDS.has(w)) versions.add(w === 'remixes' ? 'remix' : w === 'rmx' ? 'remix' : w === 'pt' ? 'part' : w);
    else if (!NOISE_WORDS.has(w)) context.add(w);
  }
}

export function parseTitle(raw: string, artists: string[] = []): TitleParts {
  const versions = new Set<string>();
  const context = new Set<string>();
  let text = normalize(raw);
  const bracketed = /[([{【「]([^)\]}】」]*)[)\]}】」]/;
  for (let i = 0; i < 3 && bracketed.test(text); i++) {
    text = text.replace(new RegExp(bracketed, 'g'), (_, inner: string) => {
      classify(inner, versions, context);
      return ' ';
    });
  }
  // An unclosed bracket: the rest is an aside.
  const open = text.search(/[([{]/);
  if (open >= 0) {
    classify(text.slice(open), versions, context);
    text = text.slice(0, open);
  }
  // "Artist - Song", "Song - From Film", "Song | Artist | Label": keep the part that's the song.
  for (let i = 0; i < 3; i++) {
    const dash = text.match(/\s+[-–—|]\s+|\s*\|\s*/);
    if (!dash || dash.index === undefined) break;
    const head = text.slice(0, dash.index);
    const tail = text.slice(dash.index + dash[0].length);
    if (isArtistName(head, artists)) {
      classify(head, new Set(), context);
      text = tail;
    } else {
      classify(tail, versions, context);
      text = head;
    }
  }
  text = text.replace(/\s(feat|ft|featuring)\.?\s.*$/, ' ');
  const words = tokens(text);
  while (words.length > 1 && TRAILING_NOISE.has(words.at(-1)!)) words.pop();
  while (words.length > 1 && TRAILING_TAKES.has(words.at(-1)!)) versions.add(words.pop()!);
  return { core: words.filter((w) => w !== 'and').join(' '), versions, context };
}

/** A channel named like a record label, film studio or broadcaster. */
const LABEL_CHANNEL = /\b(music|musics|records|recordings|tv|pictures|films|studios|entertainment|productions|vevo|series|official|label|audio)\b/;

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** What to search for: the title without its packaging, with the artist, then without. */
export function queriesFor(target: MatchTarget): string[] {
  const p = parseTitle(target.title, target.artists);
  const title = [p.core, ...p.versions].join(' ').trim();
  if (!title) return [];
  const artist = target.artists.flatMap(artistNames)[0] ?? '';
  const out = artist ? [`${title} ${artist}`, title] : [title];
  // The title in the other script, without the artist: a kana title never meets its romaji-filed
  // video otherwise (and the other way round).
  const latin = romajiOf(title).trim();
  if (CJK.test(title) && latin !== title && !CJK.test(latin)) out.push(latin);
  return [...new Set(out)];
}

/** A title and its translation: one core written as the other's bracketed aside, across scripts. */
function translationMatch(a: TitleParts, b: TitleParts): boolean {
  const crosses = (x: string, y: string) => (CJK.test(x) && !LATIN.test(x) && LATIN.test(y)) || (CJK.test(y) && !LATIN.test(y) && LATIN.test(x));
  if (!crosses(a.core, b.core)) return false;
  const words = (p: TitleParts) => [...p.context].join(' ');
  return words(b).includes(a.core) || words(a).includes(b.core);
}

const albumKey = (album?: string) => (album ? tokens(normalize(album)).filter((w) => !['album', 'deluxe', 'edition', 'expanded', 'remaster', 'remastered', 'version', 'explicit', 'clean', 'bonus', 'anniversary', 'from', 'the', 'original', 'motion', 'picture', 'soundtrack'].includes(w)).join(' ') : '');

/** How sure [candidate] is the same recording as [target], or null when it isn't. */
export function matchScore(candidate: MatchCandidate, target: MatchTarget): number | null {
  const want = parseTitle(target.title, target.artists);
  const got = parseTitle(candidate.title, candidate.artists);
  if (!want.core || !got.core) return null;
  const titleOk =
    want.core === got.core ||
    // Same word in another script: katakana and romaji meet by their reading.
    romajiOf(want.core).replace(/ /g, '') === romajiOf(got.core).replace(/ /g, '') ||
    translationMatch(want, got) ||
    (Math.min(want.core.length, got.core.length) > 3 && (want.core.includes(got.core) || got.core.includes(want.core)));
  if (!titleOk) return null;
  if (!sameSet(want.versions, got.versions)) return null;
  // A take named in the middle of a title ("Song Live Pune 2023") counts too, unless the song's own title has it.
  const wantWords = new Set(want.core.split(' '));
  if (got.core.split(' ').some((w) => VERSION_WORDS.has(w) && !wantWords.has(w))) return null;

  const wantNames = target.artists.flatMap(artistNames);
  const gotNames = candidate.artists.flatMap(artistNames);
  const titleWords = tokens(normalize(candidate.title)).join(' ');
  // The video must be credited to the song's artist: a name in a fan upload's title doesn't count.
  const exact = wantNames.some((w) => gotNames.includes(w));
  const shared = exact || wantNames.some((w) => gotNames.some((g) => sameArtist(w, g)));
  const drift = target.duration && candidate.duration ? Math.abs(target.duration - candidate.duration) : null;
  // Credited to someone else: only a label's or broadcaster's own upload (its channel named like one),
  // naming the song's artist in its title, and running the same length to the second (the same
  // master). A re-upload by anyone else is the audio on a still picture, or a cover.
  if (!shared) {
    if (drift === null || drift > 2) return null;
    if (!LABEL_CHANNEL.test(gotNames.join(' '))) return null;
    // By name or by either part of it ("Anirudh" for Anirudh Ravichander).
    const titleSet = new Set(titleWords.split(' '));
    if (!wantNames.some((w) => titleWords.includes(w) || w.split(' ').some((part) => part.length > 4 && titleSet.has(part)))) return null;
  }
  let durationScore = 0;
  if (drift !== null) {
    if (drift > 90) return null;
    durationScore = drift <= 3 ? 40 : drift <= 30 ? 15 : 0;
  }
  // The explicit and the clean edition aren't the same recording.
  if (target.explicit !== undefined && candidate.explicit !== undefined && target.explicit !== candidate.explicit) return null;
  const contextShared = [...want.context].some((w) => got.context.has(w) || titleWords.includes(w)) ? 20 : 0;
  // The same release breaks ties between same-titled ones.
  const albumShared = albumKey(target.album) && albumKey(target.album) === albumKey(candidate.album) ? 35 : 0;
  return 100 + (exact ? 25 : shared ? 10 : -30) + durationScore + contextShared + albumShared + (want.core === got.core ? 10 : 0);
}
