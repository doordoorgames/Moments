// Letter sets by language. Arabic can be added here later; only English ships for now.
export const ALPHABETS = {en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')};

const pick = list => list[Math.floor(Math.random() * list.length)];

// Two random letters, never the exact pair already on the TVs.
export function nextPair(previous, lang = 'en', random = pick) {
  const letters = ALPHABETS[lang] || ALPHABETS.en;
  for (;;) {
    const pair = [random(letters), random(letters)];
    if (!previous || pair[0] !== previous[0] || pair[1] !== previous[1]) return pair;
  }
}
