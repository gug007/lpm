import { useState } from "react";
import {
  GetPlatform,
  GetVersion,
  SetClipboardText,
} from "../../bridge/commands";
import {
  formatDiagnosticsReport,
  getDiagnosticSurface,
  normalizeError,
  redactDiagnosticString,
  reportError,
} from "../diagnostics";

interface AppRecoveryProps {
  error: unknown;
  componentStack?: string;
  onRetry: () => void;
  retryLabel?: string;
  onReload?: () => void;
}

type CopyState = "idle" | "copying" | "copied" | "failed";

async function readEnvironment() {
  const [version, platform] = await Promise.all([
    GetVersion().catch(() => "dev"),
    GetPlatform().catch(() => navigator.platform),
  ]);
  return {
    version: String(version || "dev"),
    platform: String(platform || navigator.platform),
    surface: getDiagnosticSurface(),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    theme: document.documentElement.getAttribute("data-theme") || "unknown",
  };
}

export function AppRecovery({
  error,
  componentStack,
  onRetry,
  retryLabel = "Try again",
  onReload,
}: AppRecoveryProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const normalized = normalizeError(error);

  const copyDiagnostics = async () => {
    setCopyState("copying");
    try {
      const environment = await readEnvironment();
      const report = formatDiagnosticsReport({
        error: normalized,
        componentStack,
        environment,
      });
      await SetClipboardText(report);
      setCopyState("copied");
    } catch (cause) {
      reportError("diagnostics.copy_failed", cause);
      setCopyState("failed");
    }
  };

  const copyLabel =
    copyState === "copying"
      ? "Copying…"
      : copyState === "copied"
        ? "Copied"
        : copyState === "failed"
          ? "Copy failed"
          : "Copy diagnostics";

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-[var(--bg-primary)] px-6 text-[var(--text-primary)]">
      <div className="app-drag absolute inset-x-0 top-0 h-11" />
      <main
        aria-labelledby="app-recovery-title"
        className="flex w-full max-w-lg flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-10 text-center shadow-xl"
      >
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-red)]/10 text-xl font-semibold text-[var(--accent-red)]"
        >
          !
        </div>
        <h1 id="app-recovery-title" className="mt-5 text-lg font-semibold">
          lpm hit a problem
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          The app interface stopped unexpectedly. Your services and terminal
          sessions are still running.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]"
          >
            {retryLabel}
          </button>
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            disabled={copyState === "copying"}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] disabled:opacity-60"
          >
            {copyLabel}
          </button>
        </div>
        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className="mt-3 rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          >
            Reload window
          </button>
        )}
        <p className="sr-only" aria-live="polite">
          {copyState === "copied"
            ? "Diagnostics copied to the clipboard"
            : copyState === "failed"
              ? "Diagnostics could not be copied"
              : ""}
        </p>
        <details className="mt-6 w-full text-left">
          <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Error details
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)] select-text">
            {redactDiagnosticString(normalized.message)}
          </pre>
        </details>
      </main>
    </div>
  );
}
