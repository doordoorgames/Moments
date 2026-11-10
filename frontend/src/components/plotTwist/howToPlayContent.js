// Word Trap "How to Play": everything the tutorial says lives in this file (pictures: HowToPlay.jsx).
//
// The four pictures are drawn by HowToPlay.jsx from the game's own pieces (chat lines with
// avatars, the secret-word board, the PLOT TWIST card) and filled with the names, words and
// lines below, so changing an example here changes its picture too. Who does what:
//   players[0] is "you": their secret word is words[0], they type the line in panel 2,
//                         get the new word in panel 3 and walk into the trap in panel 4.
//   players[1] owns words[1]: they wrote the earlier line in panel 2, the safe line in
//                         panel 4, and score when players[0] writes their word.
// English and Arabic must teach the same rules. HowToPlay.test.jsx checks every example
// against the real game rules (5 to 15 words a line, the trap word really fires, the safe
// line really is safe), so a bad edit fails the build instead of reaching players.
//
// Finished artwork can replace any built-in picture: put the image in
// frontend/public/plot-twist/how-to-play/ and set that panel's `image`,
// e.g. image: '/plot-twist/how-to-play/en-1.webp'. Leave it null to keep the drawn one.
export const HOW_TO_PLAY = {
  en: {
    label: 'WORD TRAP',
    title: 'How to Play',
    close: 'Close',
    // avatar: which of the 20 avatar slots the example player's picture comes from.
    // ink and mark: the font and highlight colours from colors.js.
    players: [
      {name: 'Noor', avatar: 1, ink: 'teal', mark: 'mint'},
      {name: 'Hamad', avatar: 2, ink: 'berry', mark: 'butter'},
    ],
    onlySees: name => `Only ${name} sees it`,
    newWord: 'NEW',
    safe: 'Safe',
    panels: [
      {
        title: 'Secret words',
        text: 'Everyone gets a secret word only they can see. Get the others to write yours.',
        words: ['camera', 'pillow'],
        image: null,
      },
      {
        title: 'Write your turn',
        text: 'Take turns adding 5 to 15 words. Together you build one story.',
        story: 'We sneaked onto the roof at midnight.',
        typing: 'Suddenly a cat was waiting for us',
        image: null,
      },
      {
        title: 'A new word every turn',
        text: 'Every line you send gives you one more secret word.',
        before: ['camera'],
        after: ['camera', 'umbrella'],
        image: null,
      },
      {
        title: 'Avoid the trap',
        text: 'Write someone else’s secret word and they score +1. When the host ends the story, most points wins.',
        safe: 'The cat jumped onto the old sofa.',
        trap: 'Then it knocked a pillow off the chair.',
        said: 'pillow',
        image: null,
      },
    ],
  },
  ar: {
    label: 'فخ الكلمة',
    title: 'طريقة اللعب',
    close: 'سكّر',
    players: [
      {name: 'نور', avatar: 1, ink: 'teal', mark: 'mint'},
      {name: 'حمد', avatar: 2, ink: 'berry', mark: 'butter'},
    ],
    onlySees: name => `محد يشوفها غير ${name}`,
    newWord: 'جديدة',
    safe: 'سليم',
    panels: [
      {
        title: 'كلمات سرية',
        text: 'كل لاعب ياخذ كلمة سرية محد يشوفها غيره. خلّ الباقين يكتبون كلمتك.',
        words: ['كاميرا', 'مخدة'],
        image: null,
      },
      {
        title: 'اكتب دورك',
        text: 'كل واحد بدوره يضيف من 5 إلى 15 كلمة، وتكملون سالفة وحدة مع بعض.',
        story: 'طلعنا السطح نص الليل بدون ما أحد يدري.',
        typing: 'وفجأة لقينا قطوة قاعدة تنطرنا فوق',
        image: null,
      },
      {
        title: 'كلمة جديدة كل دور',
        text: 'كل سطر ترسله يعطيك كلمة سرية زيادة.',
        before: ['كاميرا'],
        after: ['كاميرا', 'شمسية'],
        image: null,
      },
      {
        title: 'لا تطيح في الفخ',
        text: 'إذا كتبت كلمة سرية مال غيرك، صاحبها ياخذ +1. ولما المضيف يخلّص السالفة، اللي عنده أكثر نقاط يفوز.',
        safe: 'نطّت القطوة فوق الكنبة القديمة.',
        trap: 'وطيّحت المخدة من فوق الكرسي.',
        said: 'المخدة',
        image: null,
      },
    ],
  },
};

const SEEN = 'plot-twist-how-to-play-seen';
// The tutorial opens by itself once per phone, the first time someone waits in a Word Trap lobby.
export function seenHowToPlay() {
  try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
}
export function markHowToPlaySeen() {
  try { localStorage.setItem(SEEN, '1'); } catch { /* private browsing: it may open again, which is fine */ }
}
