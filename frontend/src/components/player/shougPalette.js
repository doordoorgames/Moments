// Change treatment at scene boundaries, never during a vote or on rerender.
const treatments = [
    { name: "forest-white", background: "#102f24", foreground: "#ffffff", accent: "#e3afbe" },
    { name: "maroon-mint", background: "#62283d", foreground: "#e0fff0", accent: "#e3afbe" },
    { name: "mint-black", background: "#e0fff0", foreground: "#141514", accent: "#62283d" },
    { name: "blush-black", background: "#e3afbe", foreground: "#141514", accent: "#102f24" },
    { name: "white-maroon", background: "#ffffff", foreground: "#62283d", accent: "#102f24" },
    { name: "matcha-forest", background: "#b4c492", foreground: "#102f24", accent: "#62283d" },
    { name: "black-blush", background: "#141514", foreground: "#e3afbe", accent: "#e0fff0" },
    { name: "white-forest", background: "#ffffff", foreground: "#102f24", accent: "#62283d" },
    { name: "maroon-white", background: "#62283d", foreground: "#ffffff", accent: "#e0fff0" },
    { name: "forest-blush", background: "#102f24", foreground: "#ffe3ee", accent: "#e0fff0" },
];
export function shougTreatment(key) {
    let hash = 0;
    for (const character of String(key)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return treatments[hash % treatments.length];
}
