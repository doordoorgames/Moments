"""Baccarat Hunt adventure: tunable timings, penalties, schedule and copy.

Everything players read comes from here so every phone shows identical lines.
Times are milliseconds unless the key ends in _s.
"""

TIMING = {
    "journey_ms": 180_000,          # shared countdown for the walk through the village
    "step_ms": 180,                 # Shoug's walk speed per tile (clients animate this)
    "min_step_interval_ms": 95,     # server rejects faster steps
    "ring_ms": 9_000,               # an unanswered call rings out
    "sharifa_talk_ms": 4_200,
    "otp_visible_ms": 4_000,        # private code stays on the receiver's phone
    "otp_notice_ms": 4_600,         # public "code arrived" notice
    "otp_attempts": 3,
    "otp_entry_ms": 30_000,
    "zain_line_ms": 2_600,
    "missed_call_open_ms": 15_000,  # after this anyone may call Zain back
    "train_answer_ms": 20_000,
    "train_confirm_ms": 1_300,
    "train_typing_ms": 2_200,
    "train_reply_ms": 3_400,
    "gulf_greet_ms": 2_800,
    "gulf_inspect_ms": 30_000,
    "gulf_wrong_ms": 1_800,
    "gulf_react_ms": 3_200,
    "gulf_leave_ms": 2_600,
    "gulf_attempts": 2,
    "door_scene_ms": 2_200,
    "shop_cutscene_ms": 3_800,
    "finale_ms": 25_000,
    "feed_keep": 8,
    "reassign_after_ms": 6_000,
    "navigator_grace_ms": 6_000,
    "voice_word_base_ms": 150,
}

PENALTY_S = {
    "sharifa_answer": 15,
    "zain_missed": 12,
    "otp_wrong": 8,
    "otp_failed": 10,
    "train_wrong": 10,
    "price_wrong": 5,
    "price_reveal": 5,
    "wrong_door": 5,
}

# Journey-time triggers (ms of active walking time). Zone triggers are in the engine.
SCHEDULE = {
    "sharifa_1": 9_000,
    "otp": 26_000,
    "after_otp_gap_ms": 12_000,     # first call after the code lands
    "after_call_gap_ms": 5_000,     # the second call follows quickly (the trap)
    "train_fallback": 80_000,       # if nobody walks through the fountain plaza
    "sharifa_after_gulf_ms": 7_000,
    "sharifa_late": 150_000,
}

REQUIRED_EVENTS = ("otp", "zain_call", "train", "gulf")

_VOICE_CLUE = (
    "Shoug, it's Shaheen. I need a huge favour. I want to surprise Mama with her perfume, "
    "but I can't remember the name. It's a see-through bottle, the cap is a little gold animal, "
    "and it's something to do with water. The shop is at the far end of the village. "
)
_VOICE_ROUTE = {
    "west": "Walk straight up the main street to the fountain, turn left, and follow that lane all the way up to the end. ",
    "north": "Walk straight up the main street, go past the fountain and past the clock tower, and keep going all the way to the end. ",
    "east": "Walk straight up the main street to the fountain, turn right, and follow that lane all the way up to the end. ",
}
_VOICE_END = (
    "Golden double doors. It's discounted, so it sells out fast. If they've sold out of it, get Gucci Oud instead. "
    "But only if you really can't get the first one. Yalla, hurry before someone grabs it!"
)

VOICE_NOTE = {
    "from": "Shaheen",
    "scripts": {variant: _VOICE_CLUE + route + _VOICE_END for variant, route in _VOICE_ROUTE.items()},
    # Set to a public audio URL (e.g. "/baccarat-adventure/audio/shaheen-west.mp3") once recorded.
    "audio": {"west": None, "north": None, "east": None},
}

ZAIN_INTRO = [
    "SHOUG. Big news",
    "I'm on standby for tickets to our play today!! I couldn't get any earlier and I'm DYING to go",
    "A confirmation code might come to your phone. I'll call you later to get it, so PICK UP",
    "Also the last train back is at 7 PM. Don't make me miss it",
    "And whatever you do, do NOT answer Sharifa today. She will talk for an hour",
    "Okay go go go",
]

SHARIFA = {
    "answered": [
        "SHOUG!! Finally. Okay so you know the matcha place? The pink one? So basically...",
        "Why did you hang up?? Anyway, are you at Bicester? Get me the tumbler. No, the OTHER tumbler...",
        "Okay I'm not mad. I'm just disappointed. Also is that a SALE I can hear?",
        "Hello? HELLO? Put me on speaker, I want to say hi to everyone...",
    ],
    "declined": [
        "Sharifa: did u just decline me",
        "Sharifa: SHOUG.",
        "Sharifa: fine. FINE.",
        "Sharifa: I'm telling Mama",
    ],
    "missed": "Missed call from Sharifa",
}

ZAIN_CALL = {
    "answered": "The code! Quick, read me the code!",
    "callback": "FINALLY. The code, now!",
    "correct": "GOT THEM. Two tickets. I love you. Don't miss that train!",
    "wrong": "That's not it! Ask again!",
    "failed": "Forget it. The box office closed the standby list.",
    "timeout": "You know what, never mind. I'll beg at the box office.",
    "missed": "ARE YOU SERIOUS?! I WAS CALLING FOR THE CODE. CALL ME BACK!",
}

TRAIN = {
    "question": "Wait. What time is the last train back?",
    "options": ["6:30 PM", "7 PM", "7:30 PM", "8 PM"],
    "correct": "7 PM",
    "shoug_correct": "7 PM. Relax.",
    "zain_correct": "That's my girl.",
    "shoug_wrong": "Wait, is it {answer}?",
    "shoug_timeout": "Umm...",
    "zain_wrong": "ARE YOU SERIOUS? YALLA, HURRY UP! I TOLD YOU IT'S 7 PM!",
}

GULF = {
    "greet": "Habibti! Excuse me, sorry. Can you read this for me? My glasses are in the car.",
    "ask": "How much is this bag? The writing is so small.",
    "wrong": "No no, habibti, look again.",
    "reveal": "It says two thousand pounds.",
    "react": "TWO THOUSAND POUNDS?!",
    "leave": "For a BAG?! Yalla, take me back to the car!",
    "son": "Yumma, calm down!",
    "screenshot": {
        "app": "MAISON EDIT",
        "brand": "DIOR",
        "item": "Medium Quilted Tote",
        "colour": "Blush lambskin",
        "price": "£2,000",
        "was": "",
        "installments": "Or 4 payments of £500",
        "delivery": "Free delivery over £150",
        "answer": "2000",
    },
}

DOOR_LINES = {
    "gold_single": "One golden door. Shaheen said DOUBLE doors.",
    "silver_double": "Double doors, yes. But these are silver, habibti.",
    "green_gold_handles": "Gold handles do not count, Shoug.",
    "white_double": "Pretty doors. Not gold.",
    "generic": [
        "Sorry love, we're a cheese shop.",
        "It's all candles in here. Beautiful. Wrong shop.",
        "Cashmere only, darling. No perfume.",
        "A shopkeeper waves Shoug off. Wrong shop.",
        "Shoes. Hundreds of shoes. Not perfume.",
        "This one sells teapots. Very nice teapots.",
    ],
    "locked": "The golden double doors! But Shoug's phone is going off. Deal with that first.",
    "repeat": "Already tried this one.",
}

SHOP = {
    "title": "PARFUMERIE",
    "subtitle": "Final reductions",
    "lines": ["Golden double doors. This is it.", "Uh oh. Everyone is going for the same shelf."],
}

# Nine bottles. Exactly one matches every clue: see-through, gold animal cap, water.
PERFUMES = [
    {"id": "cygne_marin", "name": "Cygne Marin", "clear": True, "cap": "gold_swan", "water": True,
     "note": "Clear glass. Gold swan cap. Sea-blue.", "correct": True,
     "why": "Clear bottle, gold swan, all about water. Exactly what Shaheen described."},
    {"id": "lac_dargent", "name": "Lac d'Argent", "clear": True, "cap": "silver_swan", "water": True,
     "note": "Clear glass. Silver swan cap. Lake-blue.",
     "why": "A silver swan. Shaheen said a GOLD animal cap."},
    {"id": "brume_oceane", "name": "Brume Oceane", "clear": True, "cap": "gold_gem", "water": True,
     "note": "Clear glass. Gold faceted stopper. Sea mist.",
     "why": "Gold cap, sure. But it's a gem, not an animal."},
    {"id": "rose_corail", "name": "Rose Corail", "clear": False, "cap": "gold_seahorse", "water": True,
     "note": "Frosted pink glass. Gold seahorse cap.",
     "why": "A gold seahorse, very cute. But you can't see through that bottle."},
    {"id": "cerf_des_bois", "name": "Cerf des Bois", "clear": True, "cap": "gold_stag", "water": False,
     "note": "Clear glass. Gold stag cap. Forest moss.",
     "why": "Clear bottle, gold stag... but a stag lives in the forest. Shaheen said water."},
    {"id": "pluie_claire", "name": "Pluie Claire", "clear": True, "cap": "crystal", "water": True,
     "note": "Clear glass. Crystal stopper. Raindrop label.",
     "why": "Rain is water, but that cap is crystal. No gold, no animal."},
    {"id": "lion_dor", "name": "Lion d'Or", "clear": False, "cap": "gold_lion", "water": False,
     "note": "Black lacquer bottle. Gold lion cap.",
     "why": "A gold lion on a black bottle. Not see-through, nothing to do with water."},
    {"id": "bleu_profond", "name": "Bleu Profond", "clear": False, "cap": "gold_fish", "water": True,
     "note": "Opaque cobalt ceramic. Gold fish cap.",
     "why": "A gold fish! But that bottle isn't see-through."},
    {"id": "gucci_oud", "name": "Gucci Oud", "clear": False, "cap": "black", "water": False, "fallback": True,
     "note": "Smoky dark glass. The backup plan.",
     "why": "Shaheen said Gucci Oud ONLY if you couldn't find the first one. Cygne Marin was right there."},
]

# Shoppers' hands. Times are ms into the final countdown. A hand either grabs
# its bottle or retreats. The correct bottle is only teased early, never hidden.
HANDS = [
    {"id": "h1", "kind": "rings", "target": "rose_corail", "enter": 2_500, "grab": 6_000},
    {"id": "h2", "kind": "jacket", "target": "cygne_marin", "enter": 5_000, "retreat": 8_200, "cover": 0.35},
    {"id": "h3", "kind": "rolex", "target": "lion_dor", "enter": 7_500, "grab": 10_800},
    {"id": "h4", "kind": "nails", "target": "pluie_claire", "enter": 9_800, "grab": 12_800},
    {"id": "h5", "kind": "tourist", "target": "lac_dargent", "enter": 12_000, "grab": 15_200},
    {"id": "h6", "kind": "jacket", "target": "cygne_marin", "enter": 14_500, "grab": 18_500, "cover": 0.5},
    {"id": "h7", "kind": "rolex", "target": "brume_oceane", "enter": 17_500, "grab": 20_500},
    {"id": "h8", "kind": "rings", "target": "bleu_profond", "enter": 19_500, "grab": 22_500},
]

OUTCOMES = {
    "win_primary": {"title": "The swan is ours", "body": "Clear bottle, gold swan, all about water. Exactly the one Shaheen described.",
                    "shaheen": "YOU'RE A LEGEND. Mama is going to cry."},
    "win_fallback": {"title": "Gucci Oud it is", "body": "The swan got snatched, so you took the backup. Exactly what Shaheen said to do.",
                     "shaheen": "Gucci Oud?? Wait... the swan was gone? Then that's PERFECT. Thank you!!"},
    "lose_fallback_early": {"title": "Too soon for Gucci", "body": "Shaheen said Gucci Oud ONLY if the first one was gone. Cygne Marin was still on the shelf.",
                            "shaheen": "Gucci Oud?? I said ONLY if you couldn't find the first one..."},
    "lose_decoy": {"title": "Wrong bottle", "shaheen": "Shoug. That is not Mama's perfume."},
    "lose_finale_timeout": {"title": "Too slow", "body": "The counter emptied while everyone argued.",
                            "shaheen": "Did you get it?? Shoug?? Hello??"},
    "lose_journey_timeout": {"title": "Sold out", "body": "A man with a gold watch just walked out with the last one.",
                             "shaheen": "It's gone?? Noooo."},
}

FEED = {
    "reassigned": "{old} dropped out. {new} takes over.",
    "navigator": "{name} is steering Shoug now.",
    "penalty": "-{s}s · {reason}",
    "hand_grab": "A shopper swiped a bottle.",
    "taken_choice": "Too late, that one's gone.",
}

SIM_PLAYERS = [
    {"id": "sim_noor", "nickname": "Noor"},
    {"id": "sim_dana", "nickname": "Dana"},
]
