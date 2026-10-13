// Phaser 3 is vendored under /public so it never enters the main app bundle.
// It loads only when someone opens the Baccarat Hunt.
export const PHASER_SRC = "/baccarat-adventure/vendor/phaser-3.90.0.min.js";

let pending = null;

export function loadPhaser() {
    if (typeof window === "undefined") return Promise.reject(new Error("No window"));
    if (window.Phaser) return Promise.resolve(window.Phaser);
    if (!pending) {
        pending = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = PHASER_SRC;
            script.async = true;
            script.onload = () => (window.Phaser ? resolve(window.Phaser) : reject(new Error("The game engine did not start.")));
            script.onerror = () => {
                pending = null;
                script.remove();
                reject(new Error("Could not load the game engine. Check your connection and try again."));
            };
            document.head.appendChild(script);
        });
    }
    return pending;
}
