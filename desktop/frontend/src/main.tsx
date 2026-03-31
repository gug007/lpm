import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadSettings } from "./settings";
import { applyTheme } from "./theme";
import "./styles/globals.css";

loadSettings().then((s) => {
  applyTheme(s.theme);
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
