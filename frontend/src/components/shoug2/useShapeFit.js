import { useLayoutEffect, useRef } from "react";

// Fit actual rendered text inside every shape's safe inset. Keep comfortable
// type; if minimum readable type is still too tall, grow the SVG and its box.
export function useShapeFit(shape, geometry, children) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const box = ref.current;
        if (!box) return;
        const content = box.querySelector(".shoug-shape__content");
        let previousWidth = -1;
        const fit = () => {
            const width = box.getBoundingClientRect().width;
            if (!width) return;
            const [top, , bottom] = geometry.inset;
            const fraction = Math.max(.15, 1 - (top + bottom) / 100);
            const minimumHeight = parseFloat(getComputedStyle(box).minHeight) || 0;
            const base = minimumHeight || width * geometry.h / geometry.w;
            box.style.height = `${base}px`;
            box.style.setProperty("--shape-fit-scale", "1");
            const text = content.querySelector("p,strong") || content;
            const font = parseFloat(getComputedStyle(text).fontSize) || 18;
            const minimum = text.tagName === "P" ? 16 : 15;
            const minScale = Math.min(1, minimum / font);
            const needed = () => {
                const elements = [...content.children];
                const height = elements.length ? elements.reduce((sum, child) => {
                    const style = getComputedStyle(child);
                    return sum + Math.max(child.getBoundingClientRect().height, child.scrollHeight) + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
                }, 0) : content.scrollHeight;
                return Math.max(height, content.scrollHeight);
            };
            box.style.setProperty("--shape-fit-scale", String(minScale));
            const required = needed();
            if (required > base * fraction + 1) box.style.height = `${Math.ceil(required / fraction) + 4}px`;
            let low = minScale, high = 1.35;
            for (let i = 0; i < 9; i++) {
                const scale = (low + high) / 2;
                box.style.setProperty("--shape-fit-scale", String(scale));
                if (needed() <= content.clientHeight + 1 && content.scrollWidth <= content.clientWidth + 1) low = scale;
                else high = scale;
            }
            box.style.setProperty("--shape-fit-scale", String(low));
            previousWidth = width;
        };
        fit();
        const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
            if (Math.abs(box.getBoundingClientRect().width - previousWidth) > .5) fit();
        }) : null;
        observer?.observe(box);
        const resize = () => fit();
        window.addEventListener("resize", resize);
        let active = true;
        document.fonts?.ready.then(() => { if (active) fit(); });
        return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", resize); };
    }, [shape, geometry, children]);
    return ref;
}
