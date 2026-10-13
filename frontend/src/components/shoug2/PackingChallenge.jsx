import { useEffect, useRef } from "react";
import { packingChallengeMarkup } from "./packingChallenge/markup";
import { mountPackingChallenge } from "./packingChallenge/runtime";

export default function PackingChallenge({ onResult, onContinue, continueLabel = "Continue" }) {
  const host = useRef(null);
  const callbacks = useRef({ onResult, onContinue });
  callbacks.current = { onResult, onContinue };
  useEffect(() => {
    const root = host.current.shadowRoot || host.current.attachShadow({ mode: "open" });
    root.innerHTML = packingChallengeMarkup;
    return mountPackingChallenge(root, result => callbacks.current.onResult?.(result), result => callbacks.current.onContinue?.(result), continueLabel);
  }, [continueLabel]);
  return <div ref={host} data-testid="packing-challenge" aria-label="The Packing Challenge" style={{ width: "100%", height: "100dvh" }} />;
}
