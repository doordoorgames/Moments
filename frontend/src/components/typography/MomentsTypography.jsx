import { useLayoutEffect, useRef } from "react";
import { contrastTone, luminance, typographyKind } from "./typography";
import "./Typography.css";

// Use for new UI. The provider also migrates existing text without adding wrappers
// around text nodes managed by React or changing screen markup/layout.
export function Typography({ as: Tag = "span", text, tone = "dark-blush", className = "", variant, children, ...props }) {
    const content = text ?? children;
    return <Tag {...props} className={className} data-moments-type={typographyKind(typeof content === "string" ? content : "", variant || (/^h[1-6]$/.test(Tag) ? "headline" : "reading"))} data-moments-tone={tone}>{content}</Tag>;
}

const candidates = "h1,h2,h3,h4,h5,h6,p,span,a,button,label,strong,b,em,small,li,td,th,div,legend,input,textarea,select,option";
const rgb = (value) => {
    const numbers = value.match(/[\d.]+/g)?.map(Number);
    return numbers?.length >= 3 ? [...numbers.slice(0, 3), numbers[3] ?? 1] : null;
};

function surfaceFor(element, root) {
    let node = element, layers = [], photographic = false;
    while (node) {
        const style = getComputedStyle(node);
        const color = rgb(style.backgroundColor);
        // Stop at an opaque card/surface before considering media behind it.
        if (style.backgroundImage !== "none") photographic = true;
        if (color?.[3] > 0) layers.push(color);
        if (color?.[3] >= 0.99) break;
        if (node === root) break;
        node = node.parentElement;
    }
    let background = [255, 255, 255];
    for (const layer of layers.reverse()) background = background.map((v, i) => layer[i] * layer[3] + v * (1 - layer[3]));
    return { background, photographic };
}

export default function MomentsTypography({ children }) {
    const rootRef = useRef(null);
    useLayoutEffect(() => {
        const root = document.body; // Includes Radix dialogs/menus and toast portals.
        root.classList.add("moments-text-system");
        let frame;
        const refresh = () => {
            root.querySelectorAll(candidates).forEach((element) => {
                if (element.closest('svg,[data-typography-ignore],.shoug-margin,.shoug-intro-mark,.vt-screw')) return;
                const formField = /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
                const hasDirectText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
                if (!formField && !hasDirectText) return;
                const text = formField ? (element.value || element.placeholder || "") : element.textContent;
                if (!text.trim()) return;
                const style = getComputedStyle(element);
                const original = rgb(style.color) || [20, 21, 20];
                const { background, photographic } = surfaceFor(element, root);
                const alternate = !!element.closest(".shoug-shopping,.shoug-phone,.vt-mission,.dark") || element.matches("h2,h4,h6");
                const preferWhite = luminance(original) > 0.65;
                const tone = photographic
                    ? (preferWhite ? (alternate ? "white-maroon" : "white-forest") : (alternate ? "dark-mint" : "dark-blush"))
                    : contrastTone(background, preferWhite, alternate);
                const headline = element.matches("h1,h2,h3,h4,h5,h6,.player-title") || !!element.closest(".shoug-scene-header strong,.shoug-intro-photo strong");
                element.dataset.momentsType = typographyKind(text, headline ? "headline" : "reading");
                element.dataset.momentsTone = tone;
            });
        };
        const schedule = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(refresh);
        };
        refresh();
        const paintProperties = (style = "") => (style.match(/(?:^|;)\s*(?:color|background(?:-color|-image)?)\s*:[^;]+/g) || []).join(";");
        const observer = new MutationObserver((records) => {
            if (records.some((record) => record.attributeName !== "style" || paintProperties(record.oldValue) !== paintProperties(record.target.getAttribute("style")))) schedule();
        });
        observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "data-state"] });
        root.addEventListener("input", schedule);
        root.addEventListener("change", schedule);
        window.addEventListener("resize", schedule);
        return () => {
            observer.disconnect();
            root.classList.remove("moments-text-system");
            cancelAnimationFrame(frame);
            root.removeEventListener("input", schedule);
            root.removeEventListener("change", schedule);
            window.removeEventListener("resize", schedule);
        };
    }, []);
    return <div ref={rootRef} className="moments-typography">{children}</div>;
}
