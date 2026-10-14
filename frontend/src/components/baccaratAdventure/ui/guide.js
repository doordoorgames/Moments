// Message data markup → [{ text, hl }] parts. **key words** are highlighted ("key"),
// ^^warnings^^ get the maroon warning style ("warn"). Unmatched markers stay as text.
export function highlightParts(text) {
    const out = [];
    const re = /\*\*(.+?)\*\*|\^\^(.+?)\^\^/g;
    const src = String(text || "");
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
        if (m.index > last) out.push({ text: src.slice(last, m.index), hl: false });
        out.push({ text: m[1] || m[2], hl: m[1] ? "key" : "warn" });
        last = re.lastIndex;
    }
    if (last < src.length) out.push({ text: src.slice(last), hl: false });
    return out;
}

export const plainText = (text) => String(text || "").replace(/\*\*|\^\^/g, "");

// Where the entry screen's guide arrow points, or null for nowhere.
// create: nickname until the first character, then the Create button (after 2s).
// join: nickname until the first character, then the room code once Enter moved there.
export function guideTarget({ mode, nickname, code, codeStep, buttonArrow }) {
    if (!mode) return null;
    const typed = (nickname || "").length > 0;
    if (!typed && !codeStep) return "nick";
    if (mode === "create") return buttonArrow ? "create" : null;
    return codeStep && !code ? "code" : null;
}
