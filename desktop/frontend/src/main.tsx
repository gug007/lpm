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
import { initScrollbarFade } from "./scrollbarFade";
import { AppRecovery } from "./components/AppRecovery";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import {
  initializeDiagnostics,
  logDiagnostic,
  normalizeError,
  reportError,
} from "./diagnostics";
import "./styles/globals.css";

const detachedProject = MIRROR_PROJECT;
const surface = detachedProject ? "detached" : "main";
const root = createRoot(document.getElementById("root")!);

initScrollbarFade();
initializeDiagnostics(surface);

function reloadWindow() {
  window.location.reload();
}

function renderApplication() {
  root.render(
    <StrictMode>
      <ErrorBoundary
        scope={`${surface}.root`}
        fallback={({ error, componentStack, reset }) => (
          <AppRecovery
            error={error}
            componentStack={componentStack}
            onRetry={reset}
            onReload={reloadWindow}
          />
        )}
      >
        <QueryClientProvider client={queryClient}>
          {detachedProject ? (
            <DetachedApp projectName={detachedProject} />
          ) : (
            <App />
          )}
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

function renderStartupFailure(error: Error) {
  root.render(
    <StrictMode>
      <AppRecovery
        error={error}
        onRetry={reloadWindow}
        retryLabel="Reload window"
      />
    </StrictMode>,
  );
}

async function startApplication() {
  logDiagnostic(
    "info",
    "app.bootstrap_started",
    "Application bootstrap started",
  );
  try {
    const [settings, , groups] = await Promise.all([
      loadSettings(),
      loadTerminals(),
      loadGroups(),
      hydrateComposerActions(),
    ]);
    applyTheme(settings.theme);
    hydrateAppStore(groups);
    useComposerStore.getState().hydrate(settings.composerOpen ?? true);
    useGeneratorsStore.getState().hydrate();
    useAccountsStore.getState().hydrate();
    initTTSEvents();
    logDiagnostic(
      "info",
      "app.bootstrap_completed",
      "Application bootstrap completed",
    );
    renderApplication();
  } catch (cause) {
    const error = normalizeError(cause);
    reportError("app.bootstrap_failed", error);
    renderStartupFailure(error);
  }
}

void startApplication();
