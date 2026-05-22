import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DetachedApp } from "./DetachedApp";
import { loadSettings } from "./store/settings";
import { loadTerminals } from "./terminals";
import { applyTheme } from "./theme";
import { hydrateAppStore } from "./store/app";
import { initTTSEvents } from "./store/tts";
import { queryClient } from "./queryClient";
import "./styles/globals.css";

const detachedProject = new URLSearchParams(window.location.search).get(
  "detached",
);

Promise.all([loadSettings(), loadTerminals()]).then(([s]) => {
  applyTheme(s.theme);
  hydrateAppStore();
  initTTSEvents();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {detachedProject ? <DetachedApp projectName={detachedProject} /> : <App />}
      </QueryClientProvider>
    </StrictMode>,
  );
});
