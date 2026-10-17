# Shopping Balance sounds

Drop short recorded clips here (mp3, m4a or ogg), then list them in
`src/components/miniGames/shoppingBalance/sound.js` under `CLIPS`.

Cues: `start`, `tip` (e.g. "OOOH!", "WAILI!"), `save` (relief sound),
`fail` ("NO NO NO!", stumble), `win`, `gameover`.

Phone snatch cues (Shoug's recorded voice; PLACEHOLDERS until recorded):
- `snatch`: startled squeal when the phone is grabbed (suggested file: `shoug-snatch-squeal.mp3`)
- `snatchPanic`: panicked line while resisting, plays once halfway (`shoug-snatch-panic.mp3`)
- `snatchSave`: relieved reaction after saving the phone (`shoug-snatch-relief.mp3`)
- `snatchFail`: funny frustrated reaction after losing a life (`shoug-snatch-lost.mp3`)
- `snatchTap`: optional tick for each tap

No text-to-speech is used. `snatchPanic` is silent until a clip is added.

Any cue with no clip uses a short built-in synth sound, so the game works without files.
