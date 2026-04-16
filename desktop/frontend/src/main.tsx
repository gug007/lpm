import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadSettings } from "./settings";
import { loadTerminals } from "./terminals";
import { applyTheme } from "./theme";
import { hydrateAppStore } from "./store/app";
import { initTTSEvents } from "./store/tts";
import "./styles/globals.css";

Promise.all([loadSettings(), loadTerminals()]).then(([s]) => {
  applyTheme(s.theme);
  hydrateAppStore();
  initTTSEvents();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
