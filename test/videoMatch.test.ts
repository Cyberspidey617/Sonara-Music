/*
 * The music-video rules, on cases from real bug reports: each one picked the wrong video, or none,
 * before its fix. Titles, credits and lengths are as YouTube and YouTube Music gave them.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fewViews, LYRIC_LIKE, matchScore, NOT_A_VIDEO, otherTake, parseViews, popularity, RECENT, stillOrNarrow, type MatchTarget } from '../src/main/videoMatch';

const naalNaalVe: MatchTarget = { title: 'Naal Naal Ve', artists: ['Darshan Raval', 'Suvarna Tiwari'], duration: 188 };
const senjudare: MatchTarget = {
  title: 'Senjudare (From "OM Chapter 1: Udhiram - The Blood Wood") [Tamil]',
  artists: ['Sai Abhyankkar', 'Harini', 'Adesh Krishna'],
  duration: 182,
  album: 'Senjudare (From "OM Chapter 1: Udhiram - The Blood Wood")',
};
const gehraHua: MatchTarget = { title: 'Gehra Hua (From "Dhurandhar")', artists: ['Shashwat Sachdev', 'Arijit Singh'], duration: 364 };
const mayavi: MatchTarget = { title: 'Mayavi (From "Bhoomi 2024")', artists: ['Sonu Nigam', 'Sanjith Hegde', 'Nagarjun Sharma'], duration: 267 };

describe('matchScore', () => {
  test('a music video twice as long as the song (its story) is still the song', () => {
    assert.notEqual(matchScore({ title: 'Naal Naal Ve', artists: ['Darshan Raval', 'Suvarna Tiwari'], duration: 407 }, naalNaalVe), null);
  });

  test('a video far longer than that is not the same piece', () => {
    assert.equal(matchScore({ title: 'Naal Naal Ve', artists: ['Darshan Raval'], duration: 188 * 4 }, naalNaalVe), null);
  });

  test('a promo far shorter than the song is not the song', () => {
    assert.equal(matchScore({ title: 'OM – Senjudare | Sai Abhyankkar', artists: ['Divo Music'], duration: 48 }, senjudare), null);
  });

  test("a film's shorter cut of the album song is still the song", () => {
    const cut = { title: 'Gehra Hua | Dhurandhar | Ranveer Singh, Sara Arjun, Shashwat Sachdev, Arijit Singh', artists: ['Saregama Music'], duration: 231 };
    assert.notEqual(matchScore(cut, gehraHua), null);
  });

  test('"From …" names the film, not a take: a chapter number in it is no version', () => {
    const own = { title: 'Senjudare (From "OM Chapter 1: Udhiram - The Blood Wood") [Tamil]', artists: ['Sai Abhyankkar'], duration: 182 };
    assert.notEqual(matchScore(own, senjudare), null);
  });

  test('a trusted label naming the film counts like the artist', () => {
    assert.notEqual(matchScore({ title: 'OM – Senjudare | Sreeleela | Dhanush | Sai Pallavi', artists: ['Divo Music'], duration: 182 }, senjudare), null);
  });

  test('a sequel ("Mayavi 2.0") is another song', () => {
    assert.equal(matchScore({ title: 'Mayavi 2.0', artists: ['Sanjith Hegde'], duration: 250 }, mayavi), null);
  });

  test("anyone else's re-upload is not the official video", () => {
    assert.equal(matchScore({ title: 'Mayavi', artists: ['Random Song Uploads'], duration: 267 }, mayavi), null);
  });

  test('a live take is not the studio song', () => {
    assert.equal(matchScore({ title: 'Mayavi (Live)', artists: ['Sonu Nigam'], duration: 270 }, mayavi), null);
  });

  test('the explicit and clean editions are different recordings', () => {
    const target: MatchTarget = { title: 'Song', artists: ['Artist'], duration: 200, explicit: true };
    assert.equal(matchScore({ title: 'Song', artists: ['Artist'], duration: 200, explicit: false }, target), null);
  });

  test('of two fitting videos, the far more watched one wins even when the other is cut to the length', () => {
    const exact = matchScore({ title: 'Naal Naal Ve', artists: ['Darshan Raval'], duration: 188 }, naalNaalVe)!;
    const story = matchScore({ title: 'Naal Naal Ve', artists: ['Darshan Raval'], duration: 407 }, naalNaalVe)!;
    assert.ok(story + popularity(5_590_000) > exact + popularity(419_000));
  });
});

describe('video titles', () => {
  test('lyric videos, audio uploads and promos are not music videos', () => {
    for (const title of ['Sirf Tum (Lyrical Video)', 'Gehra Hua - Audio', 'OM – Senjudare Promo', 'Song Visualizer', 'Song (Lyrics)'])
      assert.ok(NOT_A_VIDEO.test(title.toLowerCase()), title);
    for (const title of ['Kesariya - Film Version', 'Kun Faya Kun (Full Video Song)', 'Shape of You (Official Music Video)'])
      assert.ok(!NOT_A_VIDEO.test(title.toLowerCase()), title);
  });

  test('a lyric video is recognised by its own title (YouTube Music can drop "(Lyrical Video)")', () => {
    assert.ok(LYRIC_LIKE.test('naal naal ve (lyrical video) | darshan raval'));
    assert.ok(!LYRIC_LIKE.test('naal naal ve (music video) darshan raval'));
  });

  test("a take the song's title doesn't name rules a video out", () => {
    assert.equal(otherTake('Gehra Hua (Dhurandhar) | Shashwat Sachdev — Future Machine Live', 'Gehra Hua (From "Dhurandhar")'), true);
    assert.equal(otherTake('Kesariya - Film Version | Brahmāstra', 'Kesariya (From "Brahmastra")'), false);
    assert.equal(otherTake('Song (Live at Wembley)', 'Song (Live)'), false);
  });
});

describe('upload age and views', () => {
  test('a recent upload, however YouTube writes its age', () => {
    for (const age of ['8d ago', '3 weeks ago', '2mo ago', '5 hours ago', '1 month ago']) assert.ok(RECENT.test(age), age);
    for (const age of ['1y ago', '11 months ago', '4 months ago', '2 years ago']) assert.ok(!RECENT.test(age), age);
  });

  test('view counts', () => {
    assert.equal(parseViews('417M views'), 417e6);
    assert.equal(parseViews('1,234,567 views'), 1_234_567);
    assert.equal(parseViews('3.6K views'), 3600);
    assert.equal(parseViews('No views yet'), 0);
    assert.equal(parseViews(''), 0);
  });

  test('a handful of views is a stray upload; an unknown count is not held against it', () => {
    assert.equal(fewViews(178), true);
    assert.equal(fewViews(0), false);
    assert.equal(fewViews(3_198_693), false);
  });
});

describe('stillOrNarrow', () => {
  const avc = (width: number, height: number, kbps: number) => ({ width, height, mime_type: 'video/mp4; codecs="avc1.4d401f"', average_bitrate: kbps * 1000 });

  test('a still picture over the song (0.09 bits per pixel) is passed over', () => {
    assert.equal(stillOrNarrow([avc(1280, 720, 80), avc(854, 480, 33)]), true);
    assert.equal(stillOrNarrow([avc(852, 480, 42)]), true);
  });

  test('a real video, even a quiet one, is shown', () => {
    assert.equal(stillOrNarrow([avc(1920, 1080, 1400), avc(1280, 720, 700)]), false);
  });

  test('a square cover is passed over', () => {
    assert.equal(stillOrNarrow([avc(1080, 1080, 3000)]), true);
  });

  test('no H.264 stream or no frames: no evidence, so it is shown', () => {
    assert.equal(stillOrNarrow([{ width: 1920, height: 1080, mime_type: 'video/webm; codecs="vp9"', average_bitrate: 50_000 }]), false);
    assert.equal(stillOrNarrow([]), false);
  });
});
