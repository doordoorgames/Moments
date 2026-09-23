// Visual classification only. Story content and voting remain server owned.
export function isShougTale(story) {
    return /shou[gq]|شوق/i.test(story?.title || "");
}

export function shougScene(node) {
    const text = `${node?.title || ""} ${node?.story_text || ""}`.toLowerCase();
    if (/heathrow|airport|boarding|flight|gate|luggage|مطار|طيران|شنط/.test(text)) return "airport";
    if (/oxford|selfridges|bicester|shop|store|bag|شراء|تسوق|محل/.test(text)) return "shopping";
    if (/phone|text|message|voice note|call|dm|رسالة|تلفون|اتصال/.test(text)) return "phone";
    return "london";
}

export const choiceStyles = {
    airport: "ticket",
    shopping: "receipt",
    phone: "bubble",
    london: "paper",
};
