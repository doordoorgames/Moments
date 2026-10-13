import { useCallback, useEffect, useRef } from "react";

// Reuse the existing perfume hunt; only its solo exit changes.
export default function BaccaratHunt({ onContinue }) {
  const frame = useRef(null);
  const callback = useRef(onContinue);
  const configured = useRef(null);
  const check = useRef(null);
  callback.current = onContinue;
  const loaded = useCallback(() => {
    const doc = frame.current.contentDocument;
    if (!doc || configured.current === doc) return;
    const again = doc.getElementById("again");
    if (!again) return;
    configured.current = doc;
    clearInterval(check.current);
    if (again) {
      again.querySelector("span").textContent = "Back to mini games";
      again.setAttribute("role", "button"); again.tabIndex = 0;
      const exit = event => { event.preventDefault(); event.stopImmediatePropagation(); callback.current(); };
      again.addEventListener("click", exit, true);
      again.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") exit(event); });
    }
    // The game uses a fixed SVG stamp. Keep the longer exit label inside it.
    const style = doc.createElement("style");
    style.textContent = ".again span{font-size:15px!important}.again{max-width:100%;box-sizing:border-box}";
    doc.head.appendChild(style);

  }, []);
  useEffect(() => {
    // Install the solo exit as soon as the document appears, even if fonts are still loading.
    check.current = setInterval(loaded, 100); loaded();
    return () => clearInterval(check.current);
  }, [loaded]);
  return <iframe ref={frame} title="The Baccarat Hunt" src="/baccarat-search/index.html" onLoad={loaded} style={{ display: "block", border: 0, width: "100%", height: "100dvh" }} />;
}
