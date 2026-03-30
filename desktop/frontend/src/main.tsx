import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { getStoredTheme, applyTheme } from "./theme";
import "./styles/globals.css";

applyTheme(getStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
