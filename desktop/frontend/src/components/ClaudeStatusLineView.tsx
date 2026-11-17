import { PanelBottom } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../notifications/toast";
import type { MachineScope } from "./settings/machineCommands";
import { PageHeader } from "./ui/PageHeader";
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
import { StatusLineCustomNotice } from "./StatusLineCustomNotice";
import { notifyStatusLineChanged } from "./statusLineChanges";
import { StatusLineEmptyState } from "./StatusLineEmptyState";
import { StatusLineAlerts } from "./StatusLineAlerts";
import { StatusLineSection } from "./StatusLineSection";
import { StatusLineBuildPrompt } from "./StatusLineBuildPrompt";
import { statusLineReadingNote } from "./statusLineReadingNote";
import { useStatusLineCardSamples } from "../hooks/useStatusLineCardSamples";
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

function sameSpec(left: CustomSpec, right: CustomSpec): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function statuslineCustomBaseSpec(
  selected: string,
  editorSpec: CustomSpec,
  savedSpec: CustomSpec,
): CustomSpec {
  return selected === "custom" ? editorSpec : savedSpec;
}

type TemplateId = Exclude<StatusLineTemplateId, "custom" | "ai">;
type ApplyRequest =
  | { kind: "template"; id: TemplateId }
  | { kind: "custom"; spec: CustomSpec }
  | { kind: "restore"; spec: CustomSpec; id: TemplateId };
type ApplyJob = ApplyRequest & { revision: number };

function applyJob(request: ApplyRequest, revision: number): ApplyJob {
  return { ...request, revision };
}

interface ReplacedCustom {
  spec: CustomSpec;
  layout: TemplateId;
}

type ApplyState = "applied" | "applying" | "error";
type PresetSpecState = "idle" | "loading" | "error";

export function ClaudeStatusLineView({
  machine,
  onBack,
  backTitle = "Settings",
}: {
  machine: MachineScope;
  onBack: () => void;
  backTitle?: string;
}) {
  const { statusLine } = machine.commands;
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
  const [replacedCustom, setReplacedCustom] = useState<ReplacedCustom | null>(
    null,
  );
  const [diskCustomSpec, setDiskCustomSpec] = useState<CustomSpec | null>(null);
  const [editorKey, setEditorKey] = useState(0);
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
  const pendingCustomRef = useRef<CustomSpec | null>(null);
  const canEdit = loaded && !loadError;
  const canCustomize = canEdit && presetSpecState === "idle";

  const clearPendingCustomApply = () => {
    if (customApplyTimerRef.current) clearTimeout(customApplyTimerRef.current);
    customApplyTimerRef.current = null;
    pendingCustomRef.current = null;
  };

  const seedFromPreset = (id: string) => {
    const token = ++seedTokenRef.current;
    setPresetSpecState("loading");
    statusLine.claudePresetSpec(id)
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
      const state = await statusLine.claudeState();
      if (!mountedRef.current || stateTokenRef.current !== token) return;
      setLoadError(null);
      const nextSelection =
        (state?.selected as StatusLineTemplateId) ?? "current";
      setSelected(nextSelection);
      setHasCustom(Boolean(state?.hasCustom));
      setDiskCustomSpec(
        state?.hasSavedCustom && state?.custom
          ? (state.custom as CustomSpec)
          : null,
      );
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
      const pendingSpec = pendingCustomRef.current;
      clearPendingCustomApply();
      if (pendingSpec) {
        queueRef.current = applyJob(
          { kind: "custom", spec: pendingSpec },
          interactionRevisionRef.current,
        );
      }
      mountedRef.current = false;
      stateTokenRef.current++;
      seedTokenRef.current++;
      previewTokenRef.current++;
      if (!runningRef.current && queueRef.current) void drain();
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
        if (job.kind === "custom") await statusLine.applyClaudeCustom(job.spec);
        else if (job.kind === "restore") {
          await statusLine.applyClaudeCustom(job.spec);
          await statusLine.applyClaude(job.id);
        } else await statusLine.applyClaude(job.id);
        notifyStatusLineChanged("claude");
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
        if (job.revision !== interactionRevisionRef.current) continue;
        const message = String(error);
        if (!mountedRef.current) {
          toast.error(message);
          continue;
        }
        lastSettledRevision = job.revision;
        lastResult = "error";
        if (job.kind !== "custom" && isSeedablePreset(job.id)) {
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
    if (!canEdit || id === selected) return;
    interactionRevisionRef.current++;
    stateTokenRef.current++;
    clearPendingCustomApply();
    setSelected(id);
    setApplyError(null);
    setReplacedCustom(null);
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
    if (selected !== "custom") {
      if (
        isSeedablePreset(selected) &&
        diskCustomSpec &&
        !sameSpec(diskCustomSpec, customSpec)
      ) {
        setReplacedCustom({
          spec: diskCustomSpec,
          layout: selected as TemplateId,
        });
      }
      setSelected("custom");
    }
    setCustomSpec(spec);
    setSavedCustomSpec(spec);
    const clean = sanitizeSpec(spec);
    if (customStatusLineError(clean)) {
      if (!runningRef.current) setApplyState("applied");
      return;
    }
    setApplyState("applying");
    pendingCustomRef.current = clean;
    customApplyTimerRef.current = setTimeout(() => {
      customApplyTimerRef.current = null;
      pendingCustomRef.current = null;
      enqueue({ kind: "custom", spec: clean });
    }, 260);
  };

  const restoreReplacedCustom = () => {
    if (!replacedCustom || !canEdit) return;
    const { spec, layout } = replacedCustom;
    interactionRevisionRef.current++;
    stateTokenRef.current++;
    clearPendingCustomApply();
    cancelPresetSeed();
    setReplacedCustom(null);
    setApplyError(null);
    setSavedCustomSpec(spec);
    setSelected(layout);
    setEditorKey((key) => key + 1);
    enqueue({ kind: "restore", spec: sanitizeSpec(spec), id: layout });
    if (isSeedablePreset(layout)) seedFromPreset(layout);
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
      statusLine.previewClaude(previewSelection)
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

  const savedCustomSample = useMemo(() => {
    const spec = sanitizeSpec(savedCustomSpec);
    return customStatusLineError(spec) ? null : spec;
  }, [savedCustomSpec]);
  const cardSamples = useStatusLineCardSamples({
    enabled: loaded && !loadError,
    hasCustom,
    selected,
    savedCustomSpec: savedCustomSample,
    livePreview:
      preview.trim() && !previewError && !previewing ? preview : null,
  });
  const readingNote = statuslineShowsEditor(selected)
    ? statusLineReadingNote(cleanCustomSpec)
    : null;
  const customNotice =
    selected === "custom" && replacedCustom ? (
      <StatusLineCustomNotice
        layoutLabel={STATUSLINE_LABELS[replacedCustom.layout]}
        replaced
        disabled={!canEdit}
        onAction={restoreReplacedCustom}
      />
    ) : isSeedablePreset(selected) &&
      presetSpecState === "idle" &&
      diskCustomSpec &&
      !sameSpec(diskCustomSpec, customSpec) ? (
      <StatusLineCustomNotice
        layoutLabel={STATUSLINE_LABELS[selected]}
        replaced={false}
        disabled={!canEdit}
        onAction={() => choose("custom")}
      />
    ) : null;

  const off = selected === "current" && !hasCustom;
  const emptyHint = off ? "Status line is off" : "Nothing to show yet";
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
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={PanelBottom}
        title="Claude Code status line"
        back={{ label: backTitle, onClick: onBack }}
        description={
          <>
            Shows under the prompt box in every Claude Code session
            {machine.name ? ` on ${machine.name}` : ""}. Changes apply as you work.
          </>
        }
      />

      <div className="-mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1">
        <div
          className="w-full pb-8 transition-opacity"
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
              note={readingNote}
              off={off}
            />
          </div>

          <div className="space-y-5">
            <StatusLineSection
              title="Choose a starting point"
              description="Switch anytime. Pick Custom to arrange every item yourself."
            >
              <StatusLinePresetPicker
                selected={selected}
                hasCustom={hasCustom}
                disabled={!canEdit}
                onSelect={choose}
                samples={cardSamples}
                terminalStyle={themeStyle}
              />
            </StatusLineSection>

            <StatusLineAlerts
              loadError={loadError}
              applyError={applyError}
              presetError={
                presetSpecState === "error" && isSeedablePreset(selected)
              }
              onRetryLoad={() => {
                setLoaded(false);
                setLoadError(null);
                void refresh(true);
              }}
              onRetryPreset={() => seedFromPreset(selected)}
            />

            {statuslineShowsEditor(selected) ? (
              <CustomStatusLineEditor
                key={editorKey}
                spec={customSpec}
                onChange={onCustomChange}
                disabled={!canCustomize}
                notice={customNotice}
              />
            ) : selected === "current" ? (
              <StatusLineBuildPrompt
                ownLine={hasCustom}
                disabled={!canEdit}
                onBuild={() => choose("custom")}
              />
            ) : selected === "ai" ? (
              <StatusLineEmptyState
                disabled={!canEdit}
                onBuildCustom={() => choose("custom")}
                onStartWithClean={() => choose("meters")}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
