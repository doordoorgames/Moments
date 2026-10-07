import { useLayoutEffect } from "react";

export function useShougShell(active, treatment) {
    useLayoutEffect(() => {
        if (!active) return;
        const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
        const previous = metas.map(meta => meta.getAttribute("content"));
        const body = document.body.style.backgroundColor;
        const html = document.documentElement.style.backgroundColor;
        // iOS standalone black-translucent uses OS-owned light status glyphs.
        // Keep its native safe-area dark; browsers that adapt glyphs use the full palette.
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        const standalone = navigator.standalone || window.matchMedia("(display-mode: standalone)").matches;
        const light = ["#ffffff", "#e0fff0", "#e3afbe", "#b4c492"].includes(treatment.background);
        const background = ios && standalone && light ? treatment.accent : treatment.background;
        metas.forEach(meta => meta.setAttribute("content", background));
        document.body.style.backgroundColor = background;
        document.documentElement.style.backgroundColor = background;
        document.documentElement.style.setProperty("--shoug-native-status", background);
        document.documentElement.classList.add("shoug-app-shell");
        return () => {
            metas.forEach((meta, index) => {
                if (previous[index] != null) meta.setAttribute("content", previous[index]);
                else meta.removeAttribute("content");
            });
            document.body.style.backgroundColor = body;
            document.documentElement.style.backgroundColor = html;
            document.documentElement.style.removeProperty("--shoug-native-status");
            document.documentElement.classList.remove("shoug-app-shell");
        };
    }, [active, treatment.background, treatment.accent]);
}
