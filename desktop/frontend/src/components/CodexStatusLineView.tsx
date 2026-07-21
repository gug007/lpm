import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ApplyCodexStatusline,
  GetCodexStatuslineState,
} from "../../bridge/commands";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { ChevronLeftIcon } from "./icons";
import { CodexStatusLineEditor } from "./CodexStatusLineEditor";
import { CodexStatusLinePreview } from "./CodexStatusLinePreview";
import type { CodexStatusLinePreviewStatus } from "./CodexStatusLinePreview";
import {
  CODEX_STATUS_LINE_PRESETS,
  CodexStatusLinePresetPicker,
  codexStatusLinePresetId,
} from "./CodexStatusLinePresetPicker";
import {
  CODEX_DEFAULT_STATUS_LINE,
  canonicalCodexStatusLineId,
} from "./codexStatusLineOptions";

type ApplyState = "ready" | "saving" | "error";

interface ApplyJob {
  items: string[];
  useColors: boolean;
  revision: number;
}

export function codexStatuslineSelectionLabel(
  items: readonly string[],
  configured: boolean,
): string {
  if (!configured) return "Codex default";
  if (items.length === 0) return "Off";
  const presetId = codexStatusLinePresetId(
    items.map(canonicalCodexStatusLineId),
  );
  const preset = CODEX_STATUS_LINE_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  return preset?.label ?? `${items.length} ${items.length === 1 ? "item" : "items"}`;
}

export function CodexStatusLineView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<string[]>([
    ...CODEX_DEFAULT_STATUS_LINE,
  ]);
  const [useColors, setUseColors] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyState, setApplyState] = useState<ApplyState>("ready");
  const { themeStyle } = useTerminalTheme();
  const { fontSize } = useTerminalFontSize();
  const mountedRef = useRef(true);
  const stateTokenRef = useRef(0);
  const revisionRef = useRef(0);
  const runningRef = useRef(false);
  const queueRef = useRef<ApplyJob | null>(null);
  const pendingRef = useRef<ApplyJob | null>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEdit = loaded && !loadError;

  const clearApplyTimer = () => {
    if (applyTimerRef.current != null) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = null;
  };

  const refresh = async () => {
    const token = ++stateTokenRef.current;
    try {
      const state = await GetCodexStatuslineState();
      if (!mountedRef.current || token !== stateTokenRef.current) return;
      setItems(
        Array.isArray(state?.items)
          ? state.items
              .filter((item: unknown): item is string =>
                typeof item === "string",
              )
              .map(canonicalCodexStatusLineId)
          : [...CODEX_DEFAULT_STATUS_LINE],
      );
      setUseColors(state?.useColors !== false);
      setConfigured(Boolean(state?.configured));
      setLoadError(null);
      setApplyError(null);
      setApplyState("ready");
    } catch (error) {
      if (!mountedRef.current || token !== stateTokenRef.current) return;
      const message = String(error);
      setLoadError(message);
      toast.error(message);
    } finally {
      if (mountedRef.current && token === stateTokenRef.current) {
        setLoaded(true);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      clearApplyTimer();
      if (pendingRef.current) queueRef.current = pendingRef.current;
      pendingRef.current = null;
      mountedRef.current = false;
      stateTokenRef.current++;
      if (!runningRef.current && queueRef.current) void drain();
    };
  }, []);

  const drain = async () => {
    runningRef.current = true;
    let lastRevision: number | null = null;
    let lastState: ApplyState = "ready";
    while (queueRef.current) {
      const job = queueRef.current;
      queueRef.current = null;
      if (job.revision !== revisionRef.current) continue;
      try {
        await ApplyCodexStatusline(job.items, job.useColors);
        if (!mountedRef.current || job.revision !== revisionRef.current) {
          continue;
        }
        lastRevision = job.revision;
        lastState = "ready";
        setApplyError(null);
      } catch (error) {
        if (job.revision !== revisionRef.current) continue;
        const message = String(error);
        if (!mountedRef.current) {
          toast.error(message);
          continue;
        }
        lastRevision = job.revision;
        lastState = "error";
        setApplyError(message);
        toast.error(message);
      }
    }
    runningRef.current = false;
    if (
      mountedRef.current &&
      lastRevision != null &&
      lastRevision === revisionRef.current
    ) {
      setApplyState(lastState);
    }
  };

  const enqueue = (job: ApplyJob) => {
    queueRef.current = job;
    if (!runningRef.current) void drain();
  };

  const change = (nextItems: string[], nextUseColors: boolean) => {
    if (!canEdit) return;
    const revision = ++revisionRef.current;
    stateTokenRef.current++;
    clearApplyTimer();
    setItems(nextItems);
    setUseColors(nextUseColors);
    setConfigured(true);
    setApplyError(null);
    setApplyState("saving");
    pendingRef.current = {
      items: nextItems,
      useColors: nextUseColors,
      revision,
    };
    applyTimerRef.current = setTimeout(() => {
      applyTimerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) enqueue(pending);
    }, 260);
  };

  const previewStatus = (
    loadError
      ? "error"
      : !loaded
        ? "loading"
        : applyState
  ) satisfies CodexStatusLinePreviewStatus;

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-6">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Settings"
          title="Back to Settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
        >
          <ChevronLeftIcon />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Build your Codex status line
          </h1>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Pick Codex fields, arrange their order, and save them to config.toml.
          </p>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        <div
          className="mx-auto w-full max-w-6xl pb-6 transition-opacity"
          style={{ opacity: loaded ? 1 : 0.55 }}
          aria-busy={!loaded}
        >
          <div className="sticky top-0 z-10 bg-[var(--bg-primary)] pb-3">
            <CodexStatusLinePreview
              items={items}
              useColors={useColors}
              configured={configured}
              status={previewStatus}
              themeStyle={themeStyle}
              fontSize={fontSize}
            />
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/25 p-3.5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="rounded-md bg-[var(--accent-blue)]/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-blue-text)]">
                  Start
                </span>
                <div>
                  <h2 className="text-[12.5px] font-semibold text-[var(--text-primary)]">
                    Choose a starting point
                  </h2>
                  <p className="text-[10.5px] text-[var(--text-muted)]">
                    Every layout can be reordered and extended below.
                  </p>
                </div>
              </div>
              <CodexStatusLinePresetPicker
                items={items}
                disabled={!canEdit}
                onSelect={(nextItems) => change(nextItems, useColors)}
              />
            </section>

            {loadError && (
              <div
                role="alert"
                className="flex items-center gap-3 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-red-text)]"
              >
                <span className="min-w-0 flex-1">
                  Couldn’t load your Codex configuration.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    revisionRef.current++;
                    clearApplyTimer();
                    queueRef.current = null;
                    setLoaded(false);
                    setLoadError(null);
                    void refresh();
                  }}
                  className="h-7 shrink-0 rounded-lg border border-[var(--accent-red)]/30 px-2.5 font-medium outline-none transition-colors hover:bg-[var(--accent-red)]/10 focus-visible:ring-1 focus-visible:ring-[var(--accent-red)]"
                >
                  Retry
                </button>
              </div>
            )}

            {applyError && (
              <div
                role="alert"
                title={applyError}
                className="rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-red-text)]"
              >
                Couldn’t save this change. Your previous Codex status line is
                still active.
                <details className="mt-1 select-text text-[10px] opacity-80">
                  <summary className="w-fit cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-red)]">
                    Show details
                  </summary>
                  <p className="mt-1 break-words">{applyError}</p>
                </details>
              </div>
            )}

            <CodexStatusLineEditor
              items={items}
              useColors={useColors}
              disabled={!canEdit}
              onItemsChange={(nextItems) => change(nextItems, useColors)}
              onUseColorsChange={(nextUseColors) =>
                change(items, nextUseColors)
              }
            />

            <p className="px-1 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
              Values are representative. Colors mirror Codex’s adaptive
              default theme; a custom /theme can differ. Codex omits unavailable
              fields. Custom text, separators, and command-rendered segments
              are not currently available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
