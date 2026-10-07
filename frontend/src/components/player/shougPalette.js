import { contrast } from "../typography/typography";

// Only these six colors belong to the Shoug interface. Photos remain scene media.
export const SHOUG_LIGHT = ["#e0fff0", "#e3afbe", "#ffffff"];
export const SHOUG_DARK = ["#102f24", "#62283d", "#141514"];
const names = ["mint", "sakura", "white", "matcha", "maroon", "black"];
const colors = [...SHOUG_LIGHT, ...SHOUG_DARK];
const rgb = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16));
export const shougContrast = (a, b) => contrast(rgb(a), rgb(b));
export const isShougLight = color => SHOUG_LIGHT.includes(color);
export function shougSurface(background, foreground) {
    const opposite = isShougLight(background) ? SHOUG_DARK : SHOUG_LIGHT;
    if (!colors.includes(background) || !opposite.includes(foreground) || shougContrast(background, foreground) < 4.5) {
        throw new Error("Shoug surfaces require opposite light/dark colors with at least 4.5:1 contrast");
    }
    // A shadow is opposite the text, and a different color from its surface.
    const shadow = (isShougLight(foreground) ? SHOUG_DARK : SHOUG_LIGHT)
        .filter(color => color !== background)
        .sort((a, b) => shougContrast(b, background) - shougContrast(a, background))[0];
    const accent = opposite.filter(color => color !== foreground)
        .sort((a, b) => shougContrast(b, background) - shougContrast(a, background))[0];
    return { background, foreground, shadow, accent, name: `${names[colors.indexOf(background)]}-${names[colors.indexOf(foreground)]}` };
}
export const SHOUG_TREATMENTS = colors.flatMap(background =>
    (isShougLight(background) ? SHOUG_DARK : SHOUG_LIGHT).map(foreground => shougSurface(background, foreground)));
export function shougTreatment(key) {
    let hash = 0;
    for (const character of String(key)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return SHOUG_TREATMENTS[hash % SHOUG_TREATMENTS.length];
}
export function shougNativeTreatment(treatment) {
    // Installed WebAPK controls Android glyph appearance; there is no web API
    // equivalent to native WindowInsetsController light-status-bar flags.
    // Honor screenshots show fixed white glyphs, so never send a pale native base.
    return isShougLight(treatment.background)
        ? shougSurface(treatment.foreground, treatment.background)
        : treatment;
}
export function shougVariables(treatment) {
    const inverse = shougSurface(treatment.foreground, treatment.background);
    return {
        "--shoug-bg": treatment.background, "--shoug-fg": treatment.foreground,
        "--shoug-shadow": treatment.shadow, "--shoug-accent": treatment.accent,
        "--shoug-inverse-shadow": inverse.shadow, "--shoug-inverse-accent": inverse.accent,
        "--shoug-status-bg": treatment.background, "--shoug-status-fg": treatment.foreground,
        "--shoug-status-accent": treatment.accent,
    };
}
