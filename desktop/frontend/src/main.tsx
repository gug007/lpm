import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DetachedApp } from "./DetachedApp";
import { loadSettings } from "./store/settings";
import { loadTerminals } from "./terminals";
import { loadGroups } from "./store/groups";
import { applyTheme } from "./theme";
import { applyGlassDom, DEFAULT_INTERFACE_TRANSPARENCY } from "./glass";
import { hydrateAppStore } from "./store/app";
import { useComposerStore } from "./store/composer";
import { initTTSEvents } from "./store/tts";
import { queryClient } from "./queryClient";
import "./styles/globals.css";

const detachedProject = new URLSearchParams(window.location.search).get(
  "detached",
);

Promise.all([loadSettings(), loadTerminals(), loadGroups()]).then(([s, , g]) => {
  applyTheme(s.theme);
  // Glass affects the main window only (detached windows aren't transparent).
  // Native vibrancy is applied on the Rust side at startup; this sets the CSS.
  if (!detachedProject)
    applyGlassDom(
      s.transparency ?? false,
      s.interfaceTransparency ?? DEFAULT_INTERFACE_TRANSPARENCY,
      s.panelTransparency ?? 0,
    );
  hydrateAppStore(g);
  useComposerStore.getState().hydrate(s.composerOpen ?? false);
  initTTSEvents();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {detachedProject ? <DetachedApp projectName={detachedProject} /> : <App />}
      </QueryClientProvider>
    </StrictMode>,
  );
});
