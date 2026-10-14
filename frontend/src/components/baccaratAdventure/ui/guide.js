// **Key words** in message data → [{ text, hl }] parts. Unmatched markers stay as text.
export function highlightParts(text) {
    return String(text || "").split(/\*\*(.+?)\*\*/g)
        .map((part, i) => ({ text: part, hl: i % 2 === 1 }))
        .filter((p) => p.text);
}

export const plainText = (text) => String(text || "").replace(/\*\*/g, "");

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
