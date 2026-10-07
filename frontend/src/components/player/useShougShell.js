import { useLayoutEffect } from "react";
import { shougNativeTreatment } from "./shougPalette";

export function useShougShell(active, treatment) {
    const nativeBackground = shougNativeTreatment(treatment).background;
    useLayoutEffect(() => {
        if (!active) return;
        const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
        const previous = metas.map(meta => meta.getAttribute("content"));
        const body = document.body.style.backgroundColor;
        const html = document.documentElement.style.backgroundColor;
        const background = nativeBackground;
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
    }, [active, nativeBackground]);
}
