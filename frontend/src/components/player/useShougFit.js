import { useLayoutEffect, useRef, useState } from "react";

// Measure the real composition, including wrapped text, badges and the dock.
// First reclaim spacing; only the last stages reduce type (never below 14px).
export function useShougFit(active, sceneKey) {
    const ref = useRef(null);
    const [density, setDensity] = useState(0);
    useLayoutEffect(() => { setDensity(0); }, [sceneKey]);
    useLayoutEffect(() => {
        if (!active || !ref.current) return;
        const frame = ref.current;
        let raf;
        const measure = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                const overflow = Math.max(0, frame.scrollHeight - frame.clientHeight);
                frame.dataset.shougOverflow = String(overflow);
                if (overflow > 1) setDensity(value => Math.min(4, value + 1));
            });
        };
        const resize = () => { setDensity(0); measure(); };
        const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
        observer?.observe(frame);
        const watchContent = () => {
            frame.querySelectorAll(".shoug-content,.player-dock,.player-ending").forEach(element => observer?.observe(element));
            measure();
        };
        const mutations = new MutationObserver(watchContent);
        mutations.observe(frame, { childList: true, subtree: true, characterData: true });
        watchContent();
        window.addEventListener("resize", resize);
        window.visualViewport?.addEventListener("resize", resize);
        document.fonts?.ready.then(measure);
        measure();
        return () => {
            cancelAnimationFrame(raf); observer?.disconnect(); mutations.disconnect();
            window.removeEventListener("resize", resize);
            window.visualViewport?.removeEventListener("resize", resize);
        };
    }, [active, sceneKey, density]);
    return { ref, "data-shoug-density": density };
}
