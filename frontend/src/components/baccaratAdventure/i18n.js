// Baccarat Hunt language: English (default) or Kuwaiti Arabic, chosen per phone.
// The server keeps sending English; every visible string goes through t(), which swaps
// it for the Kuwaiti line when Arabic is on. Names: everyone says "شوق", only Zain says
// "شوقو" and stretches the waw the more urgent or angry she gets.
import { useEffect, useState } from "react";

const KEY = "bh_lang";
const listeners = new Set();
let current = (() => {
    try { return localStorage.getItem(KEY) === "ar" ? "ar" : "en"; } catch (_) { return "en"; }
})();

export function getLang() { return current; }

export function setLang(next) {
    current = next === "ar" ? "ar" : "en";
    try { localStorage.setItem(KEY, current); } catch (_) { /* this tab still switches */ }
    listeners.forEach((fn) => fn(current));
}

// ------------------------------------------------------------------ server copy
// Voice note parts mirror backend/adventure_config.py so the joined scripts match exactly.
const VOICE_CLUE_EN = "Shoug, get Mama's perfume: a **see-through bottle**, **little gold animal cap**, something with **water**. "
    + "**If you can't find it, get Gucci Oud**, quickly, before someone else gets them! ";
const VOICE_CLUE_AR = "شوق، جيبي عطر أمي: **قارورة شفافة**، **غطاها حيوان صغير ذهبي**، وله دخل بـ**الماي**. "
    + "**إذا ما لقيتيه، جيبي قوتشي عود**، بسرعة قبل لا أحد ياخذهم! ";
const VOICE_ROUTES = [
    ["Go up the main street, **turn left at the fountain** to the end: ", "امشي بالشارع الرئيسي، **عند النافورة لفّي يسار** لين آخره: "],
    ["Go up the main street, **straight past the fountain and clock tower** to the end: ", "امشي بالشارع الرئيسي، **سيدا عدّي النافورة وبرج الساعة** لين آخره: "],
    ["Go up the main street, **turn right at the fountain** to the end: ", "امشي بالشارع الرئيسي، **عند النافورة لفّي يمين** لين آخره: "],
];
const VOICE_END_EN = "the **golden double doors**.";
const VOICE_END_AR = "**الباب الذهبي أبو دفتين**.";

const AR = {
    ",": "،",
    // Zain's texts (excited: شوقووو)
    "SHOUG. Big news": "شوقووو. عندي خبر يجنن",
    "I'm on standby for tickets to our play today!! I couldn't get any earlier and I'm DYING to go": "أنا على قائمة الانتظار لتذاكر المسرحية اليوم!! ما لقيت قبل وبموت أبي أروح",
    "A confirmation code might come to your phone. **I'll call you later to get it, so PICK UP**": "يمكن يوصلج كود تأكيد على تلفونج. **بتصل عليج بعدين آخذه، فردّي علي**",
    "Also the **last train back is at 7 PM**. Don't make me miss it": "وترا **آخر قطار للرجعة الساعة 7 المسا**. لا يفوتنا",
    "And whatever you do, ^^do NOT answer Sharifa today^^. She will talk for an hour": "وأهم شي، ^^لا تردين على شريفة اليوم^^. بتسولف ساعة كاملة",
    "Okay go go go": "يلا روحي روحي روحي",

    // Sharifa (plain شوق)
    "SHOUG!! Finally. Okay so you know the matcha place? The pink one? So basically...": "شوق!! أخيرًا. زين تعرفين محل الماتشا؟ الوردي؟ المهم يعني...",
    "Why did you hang up?? Anyway, are you at Bicester? Get me the tumbler. No, the OTHER tumbler...": "ليش سكرتين؟؟ المهم، إنتي في بيستر؟ جيبي لي التمبلر. لا، التمبلر الثاني...",
    "Okay I'm not mad. I'm just disappointed. Also is that a SALE I can hear?": "أوكي أنا مو زعلانة. بس خاب ظني فيج. وصج هذا صوت تنزيلات أسمعه؟",
    "Hello? HELLO? Put me on speaker, I want to say hi to everyone...": "ألو؟ ألوووو؟ حطيني سبيكر، أبي أسلم على الكل...",
    "Sharifa: did u just decline me": "شريفة: صج كنسلتيني؟",
    "Sharifa: SHOUG.": "شريفة: شوق.",
    "Sharifa: fine. FINE.": "شريفة: أوكي. أوكييييه.",
    "Sharifa: I'm telling Mama": "شريفة: بقول لأمي",
    "Missed call from Sharifa": "مكالمة فايتة من شريفة",

    // Zain on the phone (urgent: more waws)
    "The code! Quick, read me the code!": "شوقوو الكود! بسرعة قري لي الكود!",
    "FINALLY. The code, now!": "أخيرًا! شوقووو الكود، الحين!",
    "GOT THEM. Two tickets. I love you. Don't miss that train!": "حصّلتهم! تذكرتين. أموت فيج يا شوقو. لا يفوتج القطار!",
    "That's not it! Ask again!": "شوقووو مو هذا! اسألي مرة ثانية!",
    "Forget it. The box office closed the standby list.": "خلاص انسي. شباك التذاكر سكّر قائمة الانتظار.",
    "You know what, never mind. I'll beg at the box office.": "تدرين شنو، خلاص. بروح أترجاهم عند شباك التذاكر.",
    "ARE YOU SERIOUS?! I WAS CALLING FOR THE CODE. CALL ME BACK!": "شوقوووووو جد؟! كنت أتصل عشان الكود. اتصلي علي الحين!",

    // Train text
    "Wait. What time is the last train back?": "لحظة. آخر قطار للرجعة الساعة كم؟",
    "6:30 PM": "6:30 المسا",
    "7 PM": "7 المسا",
    "7:30 PM": "7:30 المسا",
    "8 PM": "8 المسا",
    "7 PM. Relax.": "7 المسا. ريلاكس.",
    "That's my girl 🫶": "هاي بنتي يا شوقو 🫶",
    "Umm...": "اممم...",
    "ARE YOU SERIOUS? YALLA, HURRY UP! I TOLD YOU IT'S 7 PM!": "شوقوووووو جد؟! يلا بسرعة! قلت لج الساعة 7 المسا!",

    // Umm Fahad
    "Habibti! Excuse me, sorry. Can you read this for me? My glasses are in the car.": "حبيبتي! لو سمحتي، المعذرة. تقرين لي هذا؟ نظارتي في السيارة.",
    "How much is this bag? The writing is so small.": "بكم هالشنطة؟ الكتابة وايد صغيرة.",
    "No no, habibti, look again.": "لا لا حبيبتي، شوفي زين.",
    "It says two thousand pounds.": "مكتوب ألفين باوند.",
    "TWO THOUSAND POUNDS?!": "ألفين باوند؟!",
    "For a BAG?! Yalla, take me back to the car!": "عشان شنطة؟! يلا رجعني السيارة!",
    "Yumma, calm down!": "يمّه، هدّي!",
    "Medium Quilted Tote": "شنطة توت مبطنة وسط",
    "Blush lambskin": "جلد ناعم وردي فاتح",
    "Or 4 payments of £500": "أو 4 دفعات، كل وحدة £500",
    "Free delivery over £150": "توصيل مجاني فوق £150",

    // Doors
    "One golden door. Shaheen said DOUBLE doors.": "باب ذهبي واحد. شاهين قال باب أبو دفتين.",
    "Double doors, yes. But these are silver, habibti.": "دفتين، إي. بس هذي فضية حبيبتي.",
    "Gold handles do not count, Shoug.": "المقابض الذهبية ما تحسب يا شوق.",
    "Pretty doors. Not gold.": "باب حلو. بس مو ذهبي.",
    "Sorry love, we're a cheese shop.": "آسفين حبيبتي، احنا محل جبن.",
    "It's all candles in here. Beautiful. Wrong shop.": "كله شموع هني. حلو. بس مو هذا المحل.",
    "Cashmere only, darling. No perfume.": "كشمير بس حبيبتي. ما عندنا عطور.",
    "A shopkeeper waves Shoug off. Wrong shop.": "البياع يأشر لشوق تطلع. مو هذا المحل.",
    "Shoes. Hundreds of shoes. Not perfume.": "جواتي. مية جوتي. مو عطور.",
    "This one sells teapots. Very nice teapots.": "هذا يبيع قواري شاي. قواري حلوة وايد.",
    "The golden double doors! But Shoug's phone is going off. Deal with that first.": "الباب الذهبي أبو دفتين! بس تلفون شوق يرن. خلصي منه أول.",
    "Already tried this one.": "جربنا هذا من قبل.",
    "Shop": "محل",

    // Shop
    "Final reductions": "آخر التخفيضات",
    "Golden double doors. This is it.": "الباب الذهبي أبو دفتين. هذا هو.",
    "Uh oh. Everyone is going for the same shelf.": "يا ويلي. الكل رايح لنفس الرف.",

    // Perfumes
    "Clear glass. Gold swan cap. Sea-blue.": "زجاج شفاف. غطا بجعة ذهبية. أزرق بحري.",
    "Clear bottle, gold swan, all about water. Exactly what Shaheen described.": "قارورة شفافة، بجعة ذهبية، وكلها عن الماي. بالضبط مثل ما وصف شاهين.",
    "Clear glass. Silver swan cap. Lake-blue.": "زجاج شفاف. غطا بجعة فضية. أزرق بحيرة.",
    "A silver swan. Shaheen said a GOLD animal cap.": "بجعة فضية. شاهين قال غطا حيوان ذهبي.",
    "Clear glass. Gold faceted stopper. Sea mist.": "زجاج شفاف. غطا ذهبي مقصوص مثل الجوهرة. رذاذ البحر.",
    "Gold cap, sure. But it's a gem, not an animal.": "الغطا ذهبي، صح. بس جوهرة مو حيوان.",
    "Frosted pink glass. Gold seahorse cap.": "زجاج وردي مطفي. غطا حصان بحر ذهبي.",
    "A gold seahorse, very cute. But you can't see through that bottle.": "حصان بحر ذهبي، وايد كيوت. بس القارورة ما تبين من داخلها.",
    "Clear glass. Gold stag cap. Forest moss.": "زجاج شفاف. غطا غزال ذهبي. طحالب الغابة.",
    "Clear bottle, gold stag... but a stag lives in the forest. Shaheen said water.": "قارورة شفافة وغزال ذهبي... بس الغزال يعيش بالغابة. شاهين قال ماي.",
    "Clear glass. Crystal stopper. Raindrop label.": "زجاج شفاف. غطا كريستال. ملصق قطرة مطر.",
    "Rain is water, but that cap is crystal. No gold, no animal.": "المطر ماي، بس الغطا كريستال. لا ذهب ولا حيوان.",
    "Black lacquer bottle. Gold lion cap.": "قارورة سودا لامعة. غطا أسد ذهبي.",
    "A gold lion on a black bottle. Not see-through, nothing to do with water.": "أسد ذهبي على قارورة سودا. مو شفافة وما لها دخل بالماي.",
    "Opaque cobalt ceramic. Gold fish cap.": "سيراميك أزرق غامق ما يبين. غطا سمكة ذهبية.",
    "A gold fish! But that bottle isn't see-through.": "سمكة ذهبية! بس القارورة مو شفافة.",
    "Smoky dark glass. The backup plan.": "زجاج غامق مدخّن. الخطة البديلة.",
    "Shaheen said Gucci Oud ONLY if you couldn't find the first one. Cygne Marin was right there.": "شاهين قال قوتشي عود بس إذا ما لقيتي الأول. Cygne Marin كان جدامج.",
    "Gucci Oud": "قوتشي عود",

    // Outcomes
    "The swan is ours": "البجعة صارت لنا",
    "Clear bottle, gold swan, all about water. Exactly the one Shaheen described.": "قارورة شفافة، بجعة ذهبية، وكلها عن الماي. بالضبط اللي وصفه شاهين.",
    "YOU'RE A LEGEND. Mama is going to cry.": "إنتي أسطورة يا شوق. أمي بتصيح من الفرحة.",
    "Gucci Oud it is": "خلاص، قوتشي عود",
    "The swan got snatched, so you took the backup. Exactly what Shaheen said to do.": "البجعة انخطفت، فخذيتي البديل. بالضبط مثل ما قال شاهين.",
    "Gucci Oud?? Wait... the swan was gone? Then that's PERFECT. Thank you!!": "قوتشي عود؟؟ لحظة... البجعة خلصت؟ عيل كذا بيرفكت. مشكورة!!",
    "Too soon for Gucci": "بدري على قوتشي",
    "Shaheen said Gucci Oud ONLY if the first one was gone. Cygne Marin was still on the shelf.": "شاهين قال قوتشي عود بس إذا الأول خلص. Cygne Marin كان بعده على الرف.",
    "Gucci Oud?? I said ONLY if you couldn't find the first one...": "قوتشي عود؟؟ قلت بس إذا ما لقيتي الأول...",
    "Wrong bottle": "قارورة غلط",
    "Shoug. That is not Mama's perfume.": "شوق. هذا مو عطر أمي.",
    "Too slow": "بطيئين وايد",
    "The counter emptied while everyone argued.": "الرف فضى وانتوا تتهاوشون.",
    "Did you get it?? Shoug?? Hello??": "جبتيه؟؟ شوق؟؟ ألو؟؟",
    "Sold out": "خلص",
    "A man with a gold watch just walked out with the last one.": "ريّال لابس ساعة ذهب طلع بآخر وحدة.",
    "It's gone?? Noooo.": "خلص؟؟ لاااااا.",

    // Feed and penalties
    "A shopper swiped a bottle.": "وحدة خطفت قارورة.",
    "Too late, that one's gone.": "متأخرين، هذي راحت.",
    "Zain gave up on the code": "زين يأست من الكود",
    "Wrong train time": "وقت القطار غلط",
    "Zain got declined": "زين انكنسلت",
    "Shoug had to read it herself": "شوق قرت السعر بروحها",
    "Wrong code for Zain": "كود غلط لزين",
    "Zain lost the tickets": "زين راحت عليها التذاكر",
    "Misread the price": "السعر انقرا غلط",
    "Wrong shop": "محل غلط",

    // Server errors that can reach a toast
    "Face a door or a person first": "واجهي باب أو أحد أول",
    "Hold on a second": "لحظة شوي",
    "Listen to Shaheen's voice note first": "اسمعوا فويس شاهين أول",
    "That moment has passed": "راحت اللحظة",
    "The choice is already made": "الاختيار انحسم",
    "This voice note can only be played once": "الفويس يشتغل مرة وحدة بس",
    "Pick one of the times": "اختاري وقت من الأوقات",
    "Only the host can restart": "بس المضيف يقدر يعيد",
    "That didn't go through.": "ما مشت.",

    // ------------------------------------------------------------------ UI
    "Shoug's Tale · Mini game": "حكاية شوق · لعبة قصيرة",
    "Shoug's Tale · The Baccarat Hunt": "حكاية شوق · عطر شاهين",
    "The Baccarat Hunt · Room": "عطر شاهين · الغرفة",
    "Golden hour at Bicester Village. Shaheen needs his mama's perfume, Zain needs a code, and Sharifa will not stop calling. Play together, one room, every phone.":
        "العصرية في بيستر فيليج. شاهين يبي عطر أمه، زين تبي كود، وشريفة ما راح توقف اتصالات. العبوا مع بعض، غرفة وحدة، وكل واحد بتلفونه.",
    "Create a room or join a room?": "تسوين غرفة ولا تدخلين غرفة؟",
    "Create Room": "سوي غرفة",
    "Join Room": "ادخلي غرفة",
    "Create a room": "سوي غرفة",
    "Join a room": "ادخلي غرفة",
    "Nickname": "اسمج",
    "Room code": "كود الغرفة",
    "Create": "سوي",
    "Join": "ادخلي",
    "Join a room instead": "أبي أدخل غرفة بدال",
    "Create a room instead": "أبي أسوي غرفة بدال",
    "Play the classic one-screen version": "العبي النسخة القديمة بشاشة وحدة",
    "Back to mini games": "رجوع للألعاب",
    "Could not create a room.": "ما قدرنا نسوي الغرفة.",
    "Could not join that room.": "ما قدرنا ندخل هالغرفة.",
    "Could not join this room.": "ما قدرنا ندخل هالغرفة.",
    "Could not start the hunt.": "ما قدرنا نبدأ.",
    "Room code copied": "انسخ كود الغرفة",
    "Friends join from Mini games → The Baccarat Hunt → Join, with this code.": "ربعج يدخلون من الألعاب ← عطر شاهين ← ادخلي، بهالكود.",
    "in the room": "في الغرفة",
    "host · steers Shoug": "المضيف · يمشّي شوق",
    "you": "إنتي",
    "One phone steers.": "تلفون واحد يمشّي.",
    "The host walks Shoug through the village.": "المضيف يمشّي شوق في الفيليج.",
    "Everyone else answers.": "الباقين يردون.",
    "Calls, codes and questions land on different phones.": "المكالمات والأكواد والأسئلة توصل لتلفونات مختلفة.",
    "Listen once.": "اسمعوا مرة وحدة.",
    "Shaheen's voice note never plays twice.": "فويس شاهين ما يشتغل مرتين.",
    "Start the hunt": "يلا نبدأ",
    "Waiting for the host to start...": "ننطر المضيف يبدأ...",
    "Join the": "ادخلي",
    "hunt.": "اللعبة.",
    "Your name": "اسمج",
    "Join room": "ادخلي الغرفة",
    "Reload": "حدّث",
    "Walking into Bicester Village...": "داخلين بيستر فيليج...",
    "Reconnecting...": "نرجع نتصل...",
    "is steering Shoug. Shout directions!": "يمشّي شوق. صارخوا عليه بالاتجاهات!",
    "Bicester Village": "بيستر فيليج",
    "Shaheen's perfume": "عطر شاهين",
    "Paused": "موقف",
    "Time": "الوقت",
    "You're steering": "إنتي تمشّين",
    "steers": "يمشّي",
    "Bicester Village,": "بيستر فيليج،",
    "golden hour.": "وقت العصرية.",
    "Voice note · just now": "فويس · توه",
    "Voice note": "فويس",
    "Messages": "الرسايل",
    "mobile": "موبايل",
    "calling... again": "تتصل... مرة ثانية",
    "on the line": "على الخط",
    "Next": "التالي",
    "Got it": "فهمت",
    "Ready. Waiting for the host": "جاهزة. ننطر المضيف",
    "Listening...": "نسمع...",
    "Plays once. Listen together.": "يشتغل مرة وحدة. اسمعوه مع بعض.",
    "Played. Hope someone was listening.": "خلص. إن شاء الله أحد كان يسمع.",
    "Audio placeholder": "صوت مؤقت",
    "No messages yet.": "ما في رسايل للحين.",
    "THEATRE BOX OFFICE": "شباك تذاكر المسرح",
    "Your confirmation code is": "كود التأكيد مالج",
    "Only you can see this. Remember it.": "بس إنتي تشوفينه. احفظيه.",
    "The code is gone. Hope you remember it.": "الكود راح. إن شاء الله حافظته.",
    "See the OTP here": "شوفي الكود هني",
    "now": "الحين",
    "Decline": "رفض",
    "Answer": "رد",
    "Ringing": "يرن",
    "answer or decline?": "تردين ولا ترفضين؟",
    "has to pick": "لازم يختار",
    "type the code Zain needs": "اكتبي الكود اللي تبيه زين",
    "is typing the code": "يكتب الكود",
    "Time before Zain hangs up": "الوقت قبل لا تسكر زين",
    "Whoever saw the code: say it out loud!": "اللي شاف الكود: قوله بصوت عالي!",
    "try left": "محاولة باقية",
    "tries left": "محاولات باقية",
    "Missed call": "مكالمة فايتة",
    "CALL ZAIN BACK": "اتصلي على زين",
    "has to call her back.": "لازم يتصل عليها.",
    "Shoug can't move until someone calls Zain back.": "شوق ما تقدر تتحرك لين أحد يتصل على زين.",
    "Shoug, to herself": "شوق، تكلم نفسها",
    "Zain is typing...": "زين تكتب...",
    "when is the last train?": "متى آخر قطار؟",
    "is remembering the time": "يتذكر الوقت",
    "Time to answer": "وقت الجواب",
    "Did anyone catch the time in Zain's message?": "أحد شاف الوقت في رسالة زين؟",
    "this one's yours": "هذي عليج",
    "is on it": "عليه",
    "playing as": "تلعب بدال",
    "Someone": "أحد",
    "Umm Fahad": "أم فهد",
    "Fahad": "فهد",
    "Shoug": "شوق",
    "Shaheen": "شاهين",
    "Zain": "زين",
    "Sharifa": "شريفة",
    "read her the price": "قري لها السعر",
    "is reading the price": "يقرا السعر",
    "Time before Shoug reads it herself": "الوقت قبل لا تقراه شوق بروحها",
    "Tap here to type the price": "اضغطي هني واكتبي السعر",
    "price": "السعر",
    "Final reductions ": "آخر التخفيضات",
    "Pick": "اختاري",
    "one.": "وحدة.",
    "you make the final choice": "إنتي تختارين آخر شي",
    "makes the final choice": "يختار آخر شي",
    "Taken": "انخذت",
    "Buy this one": "بشتري هذي",
    "Back to the shelf": "رجوع للرف",
    "Mission complete": "المهمة تمت",
    "Mission failed": "المهمة فشلت",
    "Chosen": "انختارت",
    "chose": "اختار",
    "Time left": "الوقت الباقي",
    "Penalties": "الخصومات",
    "None": "ولا شي",
    "Wrong shops": "محلات غلط",
    "Play again": "العبوا مرة ثانية",
    "The host can start another round.": "المضيف يقدر يبدأ جولة ثانية.",
    "Playing as": "تلعبين باسم",
    "Open": "افتحي",
    "Talk": "كلّمي",
    "Tap here to view": "اضغطي هني وشوفي رسالة",
    "'s message": "",
    "Open Shoug's phone": "افتحي تلفون شوق",
    "Close phone": "سكري التلفون",
    "The Baccarat Hunt server isn't live yet. Try again after the next update.": "سيرفر اللعبة مو شغال للحين. جربي بعد التحديث الجاي.",
    "Could not load the village.": "ما قدرنا نحمّل الفيليج.",
    "The village could not start.": "الفيليج ما اشتغل.",
};

const PATTERNS = [
    [/^Wait, is it (.+)\?$/, (m) => `لحظة، الساعة ${tr(m[1])}؟`],
    [/^(.+) dropped out\. (.+) takes over\.$/, (m) => `${m[1]} طلع. ${m[2]} بيكمل.`],
    [/^(.+) is steering Shoug now\.$/, (m) => `${m[1]} يمشّي شوق الحين.`],
    [/^-(\d+)s · (.+)$/, (m) => `-${m[1]}ث · ${tr(m[2])}`],
    [/^(.+) answered Sharifa$/, (m) => `${m[1]} ردّ على شريفة`],
];

function tr(text) {
    if (text === null || text === undefined) return text;
    const s = String(text);
    if (Object.prototype.hasOwnProperty.call(AR, s)) return AR[s];
    for (const [en, ar] of VOICE_ROUTES) {
        if (s === VOICE_CLUE_EN + en + VOICE_END_EN) return VOICE_CLUE_AR + ar + VOICE_END_AR;
    }
    for (const [re, fn] of PATTERNS) {
        const m = s.match(re);
        if (m) return fn(m);
    }
    return s;
}

export function t(text, lang = current) {
    return lang === "ar" ? tr(text) : text;
}

// Re-renders on a language switch; returns { lang, t, ar }.
export function useLang() {
    const [lang, setState] = useState(current);
    useEffect(() => {
        listeners.add(setState);
        setState(current);
        return () => listeners.delete(setState);
    }, []);
    return { lang, ar: lang === "ar", t: (text) => t(text, lang), dir: lang === "ar" ? "rtl" : "ltr" };
}

export function LangToggle({ className = "" }) {
    const { lang } = useLang();
    return <div className={`bh-lang ${className}`} role="group" aria-label="Language" dir="ltr">
        <button type="button" className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
        <button type="button" className={lang === "ar" ? "on" : ""} aria-pressed={lang === "ar"} onClick={() => setLang("ar")} lang="ar">عربي</button>
    </div>;
}
