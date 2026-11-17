/*
 * People's lyric translations: reading the site's pages, choosing the song's post, and laying its
 * lines onto the lyrics. The lines here are made up for the tests (no song's lyrics), set out the way
 * the site and the lyric sources set them out.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { linePairs, postIsSong } from '../src/main/translationPage';
import { alignTranslation } from '../src/renderer/src/lib/lyricsTools';

const pairs = [
  { original: 'Dil Tera Hai Mera', english: 'My heart is yours' },
  { original: 'Raat Bhar Jaagun Main, Chaand Ko Dekhun Main', english: 'I stay up all night, watching the moon' },
  { original: 'Saath Chalo Na', english: 'Walk with me' },
  { original: 'Kaagaz Ki Kashti Mein', english: 'In a paper boat' },
];

describe('linePairs', () => {
  const tab = (title: string, body: string) =>
    `<div class="wp-block-ub-tabbed-content-tab-title-wrap"><div class="wp-block-ub-tabbed-content-tab-title">${title}</div></div>` +
    `<div class="wp-block-ub-tabbed-content-tab-content-wrap">${body}</div>`;
  const p = (...lines: string[]) => `<p class="wp-block-paragraph">${lines.join('<br>')}</p>`;

  test("reads the Translation tab's line pairs, not the Original tab's", () => {
    const html =
      p('Presenting the song with its meaning.') +
      tab('Translation', pairs.map((x) => p(x.original, x.english)).join('')) +
      tab('Original', p('Dil Tera Hai Mera', 'Saath Chalo Na', 'Kaagaz Ki Kashti Mein'));
    assert.deepEqual(linePairs(html), pairs);
  });

  test('reads entities and drops markup', () => {
    const html = tab('Translation', [p('Tu&#8217;s <em>Mera</em>', 'You&#8217;re mine &amp; only mine'), ...pairs.map((x) => p(x.original, x.english))].join(''));
    assert.deepEqual(linePairs(html)[0], { original: 'Tu’s Mera', english: 'You’re mine & only mine' });
  });

  test('a page of prose (no line pairs) gives nothing', () => {
    assert.deepEqual(linePairs(p('A story about the song.') + p('Another paragraph.')), []);
  });
});

describe('postIsSong', () => {
  const title = 'Senjudare Lyrics English Translation &#8211; Om | Harini, Sai Abhyankkar';

  test("the song's name first, translated, with one of its artists or its film", () => {
    assert.equal(postIsSong(title, 'Senjudare (From "OM Chapter 1")', ['Sai Abhyankkar']), true);
    assert.equal(postIsSong(title, 'Senjudare (From "OM Chapter 1")', ['Someone Else']), true, 'the film is named');
  });

  test("another song's post, or the right name with no credit, is not the song's", () => {
    assert.equal(postIsSong(title, 'Senjudare', ['Someone Else']), false);
    assert.equal(postIsSong('Veezha Veera Lyrics English Translation – Om | Sai Abhyankkar', 'Senjudare', ['Sai Abhyankkar']), false);
    assert.equal(postIsSong('Senjudare Song Review – Om | Sai Abhyankkar', 'Senjudare', ['Sai Abhyankkar']), false);
  });
});

describe('alignTranslation', () => {
  test('each sung line gets the meaning of the line that sounds like it, whatever the spelling', () => {
    const { text } = alignTranslation(['Dil tera hai mera', 'saath chalo naa', 'kagaz ki kashti mein'], pairs);
    assert.deepEqual(text, ['My heart is yours', 'Walk with me', 'In a paper boat']);
  });

  test('lyrics in Devanagari match the Latin spelling', () => {
    assert.equal(alignTranslation(['दिल तेरा है मेरा'], pairs).text[0], 'My heart is yours');
  });

  test('a sentence sung over two lines is shared out at its pause, one part per line', () => {
    const { text, matched } = alignTranslation(['raat bhar jaagoon main', 'chand ko dekhoon main'], pairs);
    assert.deepEqual(text, ['I stay up all night,', 'watching the moon']);
    assert.deepEqual(matched, [true, true]);
  });

  test('each line takes about its share of the sentence, not just what comes before the first comma', () => {
    const run = [{ original: 'Kaali Zulfon Wali Teri Aankhen Kahaani Kehti Saahil Tak Le Jaayengi', english: 'O dark-haired one, will your eyes tell me a story and take me to the shore?' }, ...pairs];
    const { text } = alignTranslation(['kaali zulfon wali teri aankhen kahaani kehti', 'saahil tak le jaayengi'], run);
    assert.deepEqual(text, ['O dark-haired one, will your eyes tell me a story', 'and take me to the shore?']);
  });

  test('words the translation joins (Vaa Naadhane, Vaanadhane) still match, so the line keeps its own part', () => {
    const run = [{ original: 'Vaanadhane Teri Raahon Mein Theekka Dar Pe Khada Hoon', english: 'O lord, on your paths, I stand at your door' }, ...pairs];
    const { text } = alignTranslation(['vaa naathane teri raahon mein theerkka', 'dar pe khada hoon'], run);
    assert.deepEqual(text, ['O lord, on your paths,', 'I stand at your door']);
  });

  test('a sentence with no pause to share out shows on its first line; the rest go to machine translation', () => {
    const run = [{ original: 'Neela Aasmaan Hai Jahaan Tak Dekhoon Main', english: 'The blue sky reaches far beyond my sight' }, ...pairs];
    const { text, matched } = alignTranslation(['neela aasmaan hai', 'jahaan tak dekhoon main'], run);
    assert.deepEqual(text, ['The blue sky reaches far beyond my sight', '']);
    assert.deepEqual(matched, [true, true]);
  });

  test('a phrase sung again on its own after being sung twice gets its meaning again (not taken for the sentence going on)', () => {
    const { text } = alignTranslation(['saath chalo na saath chalo na', 'saath chalo na'], pairs);
    assert.deepEqual(text, ['Walk with me', 'Walk with me']);
  });

  test('a sung line holding two of the translation’s lines gets both meanings', () => {
    const { text } = alignTranslation(['saath chalo na kaagaz ki kashti mein'], pairs);
    assert.equal(text[0], 'Walk with me In a paper boat');
  });

  test('ச written ch or s, and g or h, is the same sound (Chenjudare, Senjudare; Arogara, Arohara)', () => {
    const tamil = [
      { original: 'Senjudare Un Senkanal', english: 'Red flame, your glowing eyes' },
      { original: 'Arohara Arohara', english: 'Glory, glory' },
      ...pairs,
    ];
    const { text } = alignTranslation(['chenjchudare un chengkanal', 'arogaraa arogaraa'], tamil);
    assert.deepEqual(text, ['Red flame, your glowing eyes', 'Glory, glory']);
  });

  test('sung notes (sa ri ga ma) are not taken for words', () => {
    const { text, matched } = alignTranslation(['ka ma pa pa pa ma tha pa', 'ri ka ma ma ma tha ma pa'], pairs);
    assert.deepEqual(text, ['', '']);
    assert.deepEqual(matched, [false, false]);
  });

  test('a line sung twice in a row gets its meaning both times', () => {
    const { text } = alignTranslation(['saath chalo na', 'saath chalo na'], pairs);
    assert.deepEqual(text, ['Walk with me', 'Walk with me']);
  });

  test('a chorus sung again later gets its meaning again', () => {
    const { text } = alignTranslation(['dil tera hai mera', 'saath chalo na', 'dil tera hai mera'], pairs);
    assert.equal(text[2], 'My heart is yours');
  });

  test('lines the translation lacks are left for machine translation', () => {
    const { text, matched } = alignTranslation(['Something else entirely sung here', 'hmm', ''], pairs);
    assert.deepEqual(text, ['', '', '']);
    assert.deepEqual(matched, [false, false, false]);
  });
});
