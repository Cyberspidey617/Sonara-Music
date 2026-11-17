/*
 * Spelling folded to sound, for matching words people spell differently in Latin letters (Tamil,
 * Hindi, Malayalam… have no one spelling): used to match lyric lines and song names.
 */
/** One word as its sound: the spellings people vary for the same sound folded together. */
export function wordSound(word: string): string {
  return (
    word
      // Two letters for one sound first: zh (ழ), and the aspirates written with an h.
      .replace(/zh/g, 'l')
      .replace(/[cs]h/g, 's')
      .replace(/([tdkgbp])h/g, '$1')
      // ச is written ch or s (Chenjudare, Senjudare); a lone h is often a g or k (Arogara, Arohara).
      .replace(/[cjzs]/g, 's')
      .replace(/[ghkq]/g, 'k')
      .replace(/x/g, 'ks')
      .replace(/w/g, 'v')
      .replace(/[dt]/g, 't')
      .replace(/[bpf]/g, 'p')
      // Vowels are where spellings differ most (love, lav; mein, men; taaron, taro): one sound for all.
      .replace(/[aeiouy]+/g, 'a')
      .replace(/(.)\1+/g, '$1')
  );
}
