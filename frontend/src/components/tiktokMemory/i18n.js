// TikTok Memory copy in English and Kuwaiti Arabic. The host picks one first;
// every phone that joins the room shows the host's language.

// Grid names the way the TikTok challenge says them: rows x columns.
export const GRID_LABEL = {9: '3×3', 12: '4×3', 15: '5×3', 20: '5×4'};

const flavorEn = {perfect: 'Perfect run. Nobody talk to them.', great: 'Big brain energy.', ok: 'Half there. Respectable.',
  meh: 'The drawings had other plans.', low: 'Goldfish memory.'};
const flavorAr = {perfect: 'ولا غلطة! محد يكلمه.', great: 'مخ ذهب.', ok: 'نص نص. مقبولة.',
  meh: 'الرسمات خانتك.', low: 'ذاكرة سمچة.'};

const en = {
  dir: 'ltr',
  back: 'Back to mini games',
  kicker: 'Rooftop memory challenge',
  title: 'TikTok Memory',
  tagline: 'A new word every 3 seconds. Draw it. Then call them all back, in order, from your drawings.',
  create: 'Create room', join: 'Join room',
  yourName: 'Your name', namePlaceholder: 'Name',
  codePlaceholder: 'Room code', joinHint: 'Type the 5-digit code from the host',
  createRoom: 'Create the room', joinRoom: 'Join',
  oneMoment: 'One moment…', reconnecting: 'Reconnecting…',
  badCode: 'Enter the five-digit room code.', needName: 'Type your name first.',
  roomCode: 'Room code', copy: 'Copy', share: 'Share', scanToJoin: 'Scan to join',
  codeCopied: 'Code copied.', codeIs: code => `Code: ${code}`, linkCopied: 'Invite link copied.',
  shareThis: url => `Share this link: ${url}`, shareTitle: 'Join my TikTok Memory room',
  players: n => `${n} ${n === 1 ? 'player' : 'players'}`,
  you: 'you', hostTag: 'host',
  length: 'Words', lengthHint: n => `${n} words · 3 seconds each`,
  start: 'Start', hostWillStart: 'The host will start the game.',
  order: 'Turn order',
  yourTurn: 'Your turn', turnOf: name => `${name}’s turn`,
  readyHint: 'Hold your phone tight. A new word every 3 seconds — no pauses.',
  ready: 'I’m ready', watchHint: 'Get ready to watch. You’ll see the words.',
  waitingFor: name => `Waiting for ${name} to tap ready`, skip: 'Skip this turn',
  getReady: 'Get ready', done: 'Done!', drawIt: 'Draw it',
  drawing: name => `${name} is drawing`,
  sayThem: 'Say them in order, starting from 1',
  callingOut: name => `${name} is calling them out`,
  youJudge: 'You have the answer key', judgeHint: 'Mark each one as they say it',
  selfJudge: 'Say it out loud first, then show the word',
  right: 'Right', wrong: 'Wrong', showWord: 'Show word', word: i => `#${i}`,
  lockScore: (s, n) => `Lock score · ${s}/${n}`, soFar: (s, n) => `${s}/${n}`,
  closeDrawing: 'Close drawing',
  next: name => `Next: ${name}`, seeResults: 'See the results', waitHost: 'Waiting for the host…',
  flavor: flavorEn,
  resultsTitle: 'Final scores', tieTitle: 'Tie for first!',
  tieHint: 'The tied players each play one more turn with new words.',
  tiebreak: 'Tiebreaker', tiebreakRound: 'Tiebreaker', again: 'Play again', winner: 'Winner', tb: 'tiebreak',
  scores: 'Scores',
  unreachable: 'Could not reach the rooftop. Please try again.', noBackend: 'The game backend is not configured.',
  noteTitle: 'This room plays in English.', noteText: 'The host picked English, so every screen and word is in English.', gotIt: 'Got it',
};

const ar = {
  dir: 'rtl',
  back: 'رجوع للألعاب',
  kicker: 'تحدي ذاكرة على السطح',
  title: 'ذاكرة تيك توك',
  tagline: 'كلمة جديدة كل ثلاث ثواني. ارسمها. بعدين قول كل الكلمات بالترتيب من رسماتك.',
  create: 'سوّ غرفة', join: 'ادخل غرفة',
  yourName: 'اسمك', namePlaceholder: 'الاسم',
  codePlaceholder: 'كود الغرفة', joinHint: 'اكتب الكود (5 أرقام) من المضيف',
  createRoom: 'سوّ الغرفة', joinRoom: 'ادخل',
  oneMoment: 'لحظة…', reconnecting: 'قاعدين نرجعك…',
  badCode: 'اكتب كود الغرفة (5 أرقام).', needName: 'اكتب اسمك أول.',
  roomCode: 'كود الغرفة', copy: 'نسخ', share: 'شارك', scanToJoin: 'صوّر وادخل',
  codeCopied: 'انسخ الكود.', codeIs: code => `الكود: ${code}`, linkCopied: 'انسخ رابط الدعوة.',
  shareThis: url => `شارك هالرابط: ${url}`, shareTitle: 'تعال غرفتي في ذاكرة تيك توك',
  players: n => (n === 1 ? 'لاعب واحد' : `${n} لاعبين`),
  you: 'إنت', hostTag: 'المضيف',
  length: 'الكلمات', lengthHint: n => `${n} كلمة · ثلاث ثواني لكل كلمة`,
  start: 'ابدأ', hostWillStart: 'المضيف بيبدأ اللعبة.',
  order: 'ترتيب الأدوار',
  yourTurn: 'دورك', turnOf: name => `دور ${name}`,
  readyHint: 'امسك تلفونك زين. كلمة جديدة كل ثلاث ثواني، بدون وقفات.',
  ready: 'جاهز', watchHint: 'استعدوا تتفرجون. بتشوفون الكلمات.',
  waitingFor: name => `ننتظر ${name} يضغط جاهز`, skip: 'تخطى هالدور',
  getReady: 'استعد', done: 'خلصت!', drawIt: 'ارسمها',
  drawing: name => `${name} قاعد يرسم`,
  sayThem: 'قول الكلمات بالترتيب، من رقم 1',
  callingOut: name => `${name} قاعد يقول الكلمات`,
  youJudge: 'عندك الأجوبة', judgeHint: 'صحح كل وحدة أول ما يقولها',
  selfJudge: 'قولها بصوت عالي أول، بعدين اكشف الكلمة',
  right: 'صح', wrong: 'غلط', showWord: 'اكشف الكلمة', word: i => `#${i}`,
  lockScore: (s, n) => `اقفل النتيجة · ${s}/${n}`, soFar: (s, n) => `${s}/${n}`,
  closeDrawing: 'سكّر الرسم',
  next: name => `الدور الجاي: ${name}`, seeResults: 'شوف النتايج', waitHost: 'ننتظر المضيف…',
  flavor: flavorAr,
  resultsTitle: 'النتايج', tieTitle: 'تعادل على المركز الأول!',
  tieHint: 'اللي متعادلين كل واحد يلعب دور زيادة بكلمات جديدة.',
  tiebreak: 'جولة فاصلة', tiebreakRound: 'جولة فاصلة', again: 'العب مرة ثانية', winner: 'الفايز', tb: 'الفاصلة',
  scores: 'النقاط',
  unreachable: 'ما قدرنا نوصل للسطح. جرب مرة ثانية.', noBackend: 'سيرفر اللعبة مو مجهز.',
  noteTitle: 'هالغرفة تنلعب بالعربي.', noteText: 'المضيف اختار العربي، فكل الشاشات والكلمات بالعربي.', gotIt: 'تمام',
};

export const TEXT = {en, ar};

export function flavorFor(t, score, total) {
  const r = total ? score / total : 0;
  if (r >= 1) return t.flavor.perfect;
  if (r >= 0.75) return t.flavor.great;
  if (r >= 0.5) return t.flavor.ok;
  if (r >= 0.25) return t.flavor.meh;
  return t.flavor.low;
}
