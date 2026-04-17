import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { loadSettings } from "./settings";
import { loadTerminals } from "./terminals";
import { applyTheme } from "./theme";
import { hydrateAppStore } from "./store/app";
import { initTTSEvents } from "./store/tts";
import { queryClient } from "./queryClient";
import "./styles/globals.css";

Promise.all([loadSettings(), loadTerminals()]).then(([s]) => {
  applyTheme(s.theme);
  hydrateAppStore();
  initTTSEvents();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>
  );
});
