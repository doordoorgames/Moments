import { useEffect, useRef } from "react";
import { packLightMarkup } from "./packLight/markup";
import { mountPackLight } from "./packLight/runtime";

export default function PackLightShoug({ onResult, onContinue }) {
  const host = useRef(null);
  const callbacks = useRef({ onResult, onContinue });
  callbacks.current = { onResult, onContinue };
  useEffect(() => {
    const root = host.current.shadowRoot || host.current.attachShadow({ mode: "open" });
    root.innerHTML = packLightMarkup;
    return mountPackLight(root, result => callbacks.current.onResult(result), result => callbacks.current.onContinue(result));
  }, []);
  return <div ref={host} data-testid="pack-light-shoug" aria-label="Pack Light, Shoug" style={{width:"100%",height:"100dvh"}} />;
}
