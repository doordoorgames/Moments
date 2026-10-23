// Where the two TV screens sit inside the wallpaper, in percent of the full 1920×1080 image.
// Tune these four numbers per screen if a letter looks off-centre; nothing else needs to change.
export const WALLPAPER = {src: '/letter-tv/wallpaper.webp', width: 1920, height: 1080};

export const SCREENS = [
  {id: 'left', left: 14, top: 22, width: 30, height: 40},   // bluish-purple TV
  {id: 'right', left: 56, top: 22, width: 30, height: 40},  // olive-green TV
];

// NEXT button, centred between the TVs near the bottom (percent of the image).
export const BUTTON = {centerX: 50, bottom: 7, width: 15};

// Letter height as a share of its screen's height.
export const LETTER_SCALE = 0.78;
