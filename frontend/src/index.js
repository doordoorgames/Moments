import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" })
      .then((registration) => {
        registration.update();
        const refreshWorker = () => registration.update();
        window.addEventListener("focus", refreshWorker);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") refreshWorker();
        });
      })
      .catch(() => {
        // The app remains fully usable online if registration is unavailable.
      });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
