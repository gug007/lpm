import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DetachedApp } from "./DetachedApp";
import { loadSettings } from "./store/settings";
import { loadTerminals } from "./terminals";
import { loadGroups } from "./store/groups";
import { hydrateComposerActions } from "./store/composerActions";
import { applyTheme } from "./theme";
import { hydrateAppStore } from "./store/app";
import { useComposerStore } from "./store/composer";
import { initTTSEvents } from "./store/tts";
import { useGeneratorsStore } from "./store/generators";
import { useAccountsStore } from "./store/accounts";
import { queryClient } from "./queryClient";
import { MIRROR_PROJECT } from "./mirror";
import "./styles/globals.css";

const detachedProject = MIRROR_PROJECT;

Promise.all([loadSettings(), loadTerminals(), loadGroups(), hydrateComposerActions()]).then(([s, , g]) => {
  applyTheme(s.theme);
  hydrateAppStore(g);
  useComposerStore.getState().hydrate(s.composerOpen ?? true);
  useGeneratorsStore.getState().hydrate();
  useAccountsStore.getState().hydrate();
  initTTSEvents();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {detachedProject ? <DetachedApp projectName={detachedProject} /> : <App />}
      </QueryClientProvider>
    </StrictMode>,
  );
});
