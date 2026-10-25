// Letter sets by language. Arabic can be added here later; only English ships for now.
export const ALPHABETS = {en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')};
// Per-position pools. English: X and Z never appear; Q may start a pair but never end one.
// Must match START_LETTERS / END_LETTERS in backend/letter_tv.py.
export const START_LETTERS = {en: ALPHABETS.en.filter(c => !'XZ'.includes(c))};
export const END_LETTERS = {en: ALPHABETS.en.filter(c => !'XZQ'.includes(c))};

const pick = list => list[Math.floor(Math.random() * list.length)];

// Two random letters (first from the start pool, second from the end pool),
// never the exact pair already on the TVs.
export function nextPair(previous, lang = 'en', random = pick) {
  const letters = ALPHABETS[lang] || ALPHABETS.en;
  const first = START_LETTERS[lang] || letters, last = END_LETTERS[lang] || letters;
  for (;;) {
    const pair = [random(first), random(last)];
    if (!previous || pair[0] !== previous[0] || pair[1] !== previous[1]) return pair;
  }
}
