import { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  GetClaudeStatuslineState,
  ApplyClaudeStatusline,
  ApplyClaudeStatuslineCustom,
  ClaudeStatuslinePresetSpec,
  PreviewClaudeStatusline,
} from "../../bridge/commands";
import { ChevronLeftIcon } from "./icons";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { CustomStatusLineEditor } from "./CustomStatusLineEditor";
import { StatusLinePreview } from "./StatusLinePreview";
import type { StatusLinePreviewStatus } from "./StatusLinePreview";
import {
  STATUSLINE_LABELS,
  StatusLinePresetPicker,
  type StatusLineTemplateId,
} from "./StatusLinePresetPicker";
import { customStatusLineError } from "./statusLineValidation";
import type { CustomSpec } from "./statusLineTypes";

export function statuslineSelectionLabel(
  selected: string,
  hasCustom: boolean,
): string {
  if (selected === "current" && !hasCustom) return "Off";
  return (
    STATUSLINE_LABELS[selected as StatusLineTemplateId] ??
    STATUSLINE_LABELS.current
  );
}

const SPEC_BACKED: readonly StatusLineTemplateId[] = [
  "vibrant",
  "minimal",
  "context",
  "meters",
  "custom",
];

export function statuslineShowsEditor(selected: string): boolean {
  return (SPEC_BACKED as readonly string[]).includes(selected);
}

function isSeedablePreset(id: string): boolean {
  return (
    id === "vibrant" || id === "meters" || id === "minimal" || id === "context"
  );
}

const DEFAULT_SPEC: CustomSpec = {
  segments: [
    { id: "folder", color: "default", text: "" },
    { id: "model", color: "claude", text: "" },
    { id: "ctx", color: "default", text: "" },
    { id: "five", color: "default", text: "" },
    { id: "seven", color: "default", text: "" },
    { id: "cost", color: "yellow", text: "" },
  ],
  separator: "·",
  meterStyle: "bar",
  meterWidth: 7,
  icons: true,
  gitStatus: false,
};

function sanitizeSpec(spec: CustomSpec): CustomSpec {
  return {
    ...spec,
    segments: spec.segments.filter(
      (segment) => segment.id !== "text" || segment.text.trim() !== "",
    ),
  };
}

export function statuslineCustomBaseSpec(
  selected: string,
  editorSpec: CustomSpec,
  savedSpec: CustomSpec,
): CustomSpec {
  return selected === "custom" ? editorSpec : savedSpec;
}

type ApplyRequest =
  | { kind: "template"; id: Exclude<StatusLineTemplateId, "custom" | "ai"> }
  | { kind: "custom"; spec: CustomSpec };
type ApplyJob = ApplyRequest & { revision: number };

function applyJob(request: ApplyRequest, revision: number): ApplyJob {
  return request.kind === "custom"
    ? { kind: "custom", spec: request.spec, revision }
    : { kind: "template", id: request.id, revision };
}

type ApplyState = "applied" | "applying" | "error";
type PresetSpecState = "idle" | "loading" | "error";

export function ClaudeStatusLineView({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<StatusLineTemplateId>("current");
  const [hasCustom, setHasCustom] = useState(false);
  const [customSpec, setCustomSpec] = useState<CustomSpec>(DEFAULT_SPEC);
  const [savedCustomSpec, setSavedCustomSpec] =
    useState<CustomSpec>(DEFAULT_SPEC);
  const [preview, setPreview] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [applyState, setApplyState] = useState<ApplyState>("applied");
  const [presetSpecState, setPresetSpecState] =
    useState<PresetSpecState>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { themeStyle } = useTerminalTheme();
  const { fontSize } = useTerminalFontSize();
  const runningRef = useRef(false);
  const queueRef = useRef<ApplyJob | null>(null);
  const mountedRef = useRef(true);
  const interactionRevisionRef = useRef(0);
  const stateTokenRef = useRef(0);
  const seedTokenRef = useRef(0);
  const previewTokenRef = useRef(0);
  const customApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const canEdit = loaded && !loadError;
  const canCustomize = canEdit && presetSpecState === "idle";

  const clearPendingCustomApply = () => {
    if (customApplyTimerRef.current) clearTimeout(customApplyTimerRef.current);
    customApplyTimerRef.current = null;
  };

  const seedFromPreset = (id: string) => {
    const token = ++seedTokenRef.current;
    setPresetSpecState("loading");
    ClaudeStatuslinePresetSpec(id)
      .then((spec) => {
        if (seedTokenRef.current !== token) return;
        if (spec) {
          setCustomSpec(spec as CustomSpec);
          setPresetSpecState("idle");
        } else {
          setPresetSpecState("error");
        }
      })
      .catch(() => {
        if (seedTokenRef.current === token) setPresetSpecState("error");
      });
  };

  const cancelPresetSeed = () => {
    seedTokenRef.current++;
    setPresetSpecState("idle");
  };

  const refresh = async (syncSpec = false) => {
    const token = ++stateTokenRef.current;
    try {
      const state = await GetClaudeStatuslineState();
      if (!mountedRef.current || stateTokenRef.current !== token) return;
      setLoadError(null);
      const nextSelection =
        (state?.selected as StatusLineTemplateId) ?? "current";
      setSelected(nextSelection);
      setHasCustom(Boolean(state?.hasCustom));
      if (syncSpec) {
        if (state?.custom) setSavedCustomSpec(state.custom as CustomSpec);
        if (isSeedablePreset(nextSelection)) seedFromPreset(nextSelection);
        else {
          cancelPresetSeed();
          if (state?.custom) setCustomSpec(state.custom as CustomSpec);
        }
      }
    } catch (error) {
      if (mountedRef.current && stateTokenRef.current === token) {
        const message = String(error);
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (mountedRef.current && stateTokenRef.current === token) {
        setLoaded(true);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void refresh(true);
    return () => {
      mountedRef.current = false;
      clearPendingCustomApply();
      queueRef.current = null;
      interactionRevisionRef.current++;
      stateTokenRef.current++;
      seedTokenRef.current++;
      previewTokenRef.current++;
    };
  }, []);

  const drain = async () => {
    runningRef.current = true;
    let lastResult: ApplyState = "applied";
    let lastSettledRevision: number | null = null;
    let shouldSyncSpec = false;
    while (queueRef.current) {
      const job = queueRef.current;
      queueRef.current = null;
      if (job.revision !== interactionRevisionRef.current) continue;
      try {
        if (job.kind === "custom") await ApplyClaudeStatuslineCustom(job.spec);
        else await ApplyClaudeStatusline(job.id);
        if (
          !mountedRef.current ||
          job.revision !== interactionRevisionRef.current
        ) {
          continue;
        }
        lastSettledRevision = job.revision;
        lastResult = "applied";
        setApplyError(null);
      } catch (error) {
        if (
          !mountedRef.current ||
          job.revision !== interactionRevisionRef.current
        ) {
          continue;
        }
        const message = String(error);
        lastSettledRevision = job.revision;
        lastResult = "error";
        if (job.kind === "template" && isSeedablePreset(job.id)) {
          seedTokenRef.current++;
          setPresetSpecState("loading");
          shouldSyncSpec = true;
        }
        setApplyError(message);
        toast.error(message);
      }
    }
    runningRef.current = false;
    if (!mountedRef.current) return;
    if (lastSettledRevision !== interactionRevisionRef.current) return;
    setApplyState(lastResult);
    void refresh(shouldSyncSpec);
  };

  const enqueue = (request: ApplyRequest) => {
    setApplyState("applying");
    setApplyError(null);
    queueRef.current = applyJob(request, interactionRevisionRef.current);
    if (!runningRef.current) void drain();
  };

  const choose = (id: StatusLineTemplateId) => {
    if (!canEdit) return;
    interactionRevisionRef.current++;
    stateTokenRef.current++;
    clearPendingCustomApply();
    setSelected(id);
    setApplyError(null);
    cancelPresetSeed();
    if (id === "custom") {
      const baseSpec = statuslineCustomBaseSpec(
        selected,
        customSpec,
        savedCustomSpec,
      );
      setCustomSpec(baseSpec);
      const spec = sanitizeSpec(baseSpec);
      if (!customStatusLineError(spec)) enqueue({ kind: "custom", spec });
    } else if (id !== "ai") {
      enqueue({ kind: "template", id });
      if (isSeedablePreset(id)) seedFromPreset(id);
    }
  };

  const onCustomChange = (spec: CustomSpec) => {
    if (!canCustomize) return;
    interactionRevisionRef.current++;
    stateTokenRef.current++;
    clearPendingCustomApply();
    cancelPresetSeed();
    setApplyError(null);
    if (selected !== "custom") setSelected("custom");
    setCustomSpec(spec);
    setSavedCustomSpec(spec);
    const clean = sanitizeSpec(spec);
    if (customStatusLineError(clean)) {
      if (!runningRef.current) setApplyState("applied");
      return;
    }
    setApplyState("applying");
    customApplyTimerRef.current = setTimeout(() => {
      customApplyTimerRef.current = null;
      enqueue({ kind: "custom", spec: clean });
    }, 260);
  };

  const cleanCustomSpec = useMemo(() => sanitizeSpec(customSpec), [customSpec]);
  const customValidationError = useMemo(
    () => customStatusLineError(cleanCustomSpec),
    [cleanCustomSpec],
  );
  const previewSelection = useMemo(() => {
    switch (selected) {
      case "custom":
        return { kind: "custom", spec: cleanCustomSpec };
      case "current":
        return { kind: "current" };
      case "ai":
        return { kind: "ai" };
      default:
        return { kind: "template", id: selected };
    }
  }, [selected, cleanCustomSpec]);

  useEffect(() => {
    const token = ++previewTokenRef.current;
    if (!loaded || loadError) {
      setPreviewing(false);
      setPreviewError(false);
      return;
    }
    if (selected === "custom" && customValidationError) {
      setPreviewing(false);
      setPreviewError(false);
      return;
    }
    setPreviewing(true);
    setPreviewError(false);
    const handle = setTimeout(() => {
      if (previewTokenRef.current !== token) return;
      PreviewClaudeStatusline(previewSelection)
        .then((output: string) => {
          if (previewTokenRef.current === token) {
            setPreview(typeof output === "string" ? output : "");
            setPreviewError(false);
          }
        })
        .catch(() => {
          if (previewTokenRef.current === token) {
            setPreview("");
            setPreviewError(true);
          }
        })
        .finally(() => {
          if (previewTokenRef.current === token) setPreviewing(false);
        });
    }, 140);
    return () => clearTimeout(handle);
  }, [previewSelection, selected, customValidationError, loaded, loadError]);

  const emptyHint =
    selected === "current" && !hasCustom
      ? "Status line is off"
      : "Nothing to show yet";
  const isUpdating = previewing || applyState === "applying";
  const previewStatus = (
    loadError
      ? "error"
      : !loaded
        ? "loading"
        : selected === "custom" && customValidationError
          ? "paused"
          : previewError
            ? "error"
            : isUpdating
              ? "updating"
              : applyState === "error"
                ? "preview-only"
                : "live"
  ) satisfies StatusLinePreviewStatus;
  const selectionLabel = loadError
    ? "Status unavailable"
    : loaded
      ? statuslineSelectionLabel(selected, hasCustom)
      : "Loading status";

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-6">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Settings"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          title="Back to Settings"
        >
          <ChevronLeftIcon />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Build your Claude Code status line
          </h1>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            Start with a layout, then tune every item. Changes apply as you work.
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
            <StatusLinePreview
              text={preview}
              emptyHint={emptyHint}
              themeStyle={themeStyle}
              fontSize={fontSize}
              status={previewStatus}
              selectionLabel={selectionLabel}
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
                    Switch anytime. Every layout stays customizable.
                  </p>
                </div>
              </div>
              <StatusLinePresetPicker
                selected={selected}
                hasCustom={hasCustom}
                disabled={!canEdit}
                onSelect={choose}
              />
            </section>

            <div className="min-w-0 space-y-3">
              {loadError && (
                <div
                  role="alert"
                  className="flex items-center gap-3 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-red-text)]"
                >
                  <span className="min-w-0 flex-1">
                    Couldn’t load your saved status line.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLoaded(false);
                      setLoadError(null);
                      void refresh(true);
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
                  Couldn’t apply this change. Your previous status line is still
                  active.
                  <details className="mt-1 select-text text-[10px] opacity-80">
                    <summary className="w-fit cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-red)]">
                      Show details
                    </summary>
                    <p className="mt-1 break-words">{applyError}</p>
                  </details>
                </div>
              )}

              {presetSpecState === "error" &&
                isSeedablePreset(selected) && (
                  <div
                    role="alert"
                    className="flex items-center gap-3 rounded-xl border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/8 px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--accent-amber-text)]"
                  >
                    <span className="min-w-0 flex-1">
                      Couldn’t load this preset’s customization controls.
                    </span>
                    <button
                      type="button"
                      onClick={() => seedFromPreset(selected)}
                      className="h-7 shrink-0 rounded-lg border border-[var(--accent-amber)]/30 px-2.5 font-medium outline-none transition-colors hover:bg-[var(--accent-amber)]/10 focus-visible:ring-1 focus-visible:ring-[var(--accent-amber)]"
                    >
                      Retry
                    </button>
                  </div>
                )}
            </div>

            {statuslineShowsEditor(selected) ? (
              <CustomStatusLineEditor
                spec={customSpec}
                onChange={onCustomChange}
                disabled={!canCustomize}
              />
            ) : (
              <section className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)]/20 px-5 py-7 text-center">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-green)]/10 text-[var(--accent-green-text)]">
                  {selected === "ai" ? (
                    <Sparkles size={19} />
                  ) : (
                    <SlidersHorizontal size={19} />
                  )}
                </span>
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {selected === "ai"
                    ? "Your AI-edited line is active"
                    : "Ready to make it yours?"}
                </h2>
                <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-[var(--text-muted)]">
                  Choose Custom to arrange each item yourself, or start with
                  Clean and fine-tune it.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => choose("custom")}
                    disabled={!canEdit}
                    className="h-8 rounded-lg bg-[var(--accent-green)] px-3 text-[11px] font-semibold text-green-950 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Build a custom line
                  </button>
                  <button
                    type="button"
                    onClick={() => choose("meters")}
                    disabled={!canEdit}
                    className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 text-[11px] font-medium text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Start with Clean
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
