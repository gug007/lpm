import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadSettings } from "./settings";
import { loadTerminals } from "./terminals";
import { applyTheme } from "./theme";
import { hydrateAppStore } from "./store/app";
import "./styles/globals.css";

Promise.all([loadSettings(), loadTerminals()]).then(([s]) => {
  applyTheme(s.theme);
  hydrateAppStore();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
