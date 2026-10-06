export const wordCount = (text = "") =>
    (String(text).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;

export const typographyKind = (text) => wordCount(text) <= 5 ? "display-short" : "reading-long";

export const FOREST = "white-forest";
export const MAROON = "white-maroon";
export const BLUSH = "dark-blush";
export const MINT = "dark-mint";

export function luminance([r, g, b]) {
    const linear = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function contrastTone(background, preferWhite = false, alternate = false) {
    const white = [255, 255, 255], dark = [20, 21, 20];
    const whiteRatio = contrast(white, background);
    const darkRatio = contrast(dark, background);
    const useWhite = preferWhite ? whiteRatio >= 4.5 : darkRatio < 4.5;
    return useWhite ? (alternate ? MAROON : FOREST) : (alternate ? MINT : BLUSH);
}
