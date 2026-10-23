import wallpaper from './assets/wallpaper.webp';

// Where the two TV screens sit inside the wallpaper, in percent of the full image.
// Measured from the cream screen areas of the art. Tune these four numbers per screen
// if a letter ever looks off-centre; nothing else needs to change.
export const WALLPAPER = {src: wallpaper, width: 1672, height: 941};

export const SCREENS = [
  {id: 'left', left: 10.53, top: 22.0, width: 31.4, height: 56.75},   // bluish-purple TV
  {id: 'right', left: 54.78, top: 23.49, width: 30.62, height: 57.17}, // olive-green TV
];

// NEXT button: centred in the gap between the TVs, below both screens (percent of the image).
export const BUTTON = {centerX: 50.6, bottom: 3, width: 15};

// Letter height as a share of its screen's height.
export const LETTER_SCALE = 0.7;
