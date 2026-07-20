import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  GetClaudeStatuslineState,
  ApplyClaudeStatusline,
  ApplyClaudeStatuslineCustom,
  PreviewClaudeStatusline,
} from "../../bridge/commands";
import { ChevronLeftIcon } from "./icons";
import { AnsiLine } from "./AnsiLine";
import { useTerminalTheme } from "../hooks/useTerminalTheme";
import { useTerminalFontSize } from "../hooks/useTerminalFontSize";
import { CustomStatusLineEditor, type CustomSpec } from "./CustomStatusLineEditor";
import { AiRefineBar } from "./AiRefineBar";

type TemplateId = "current" | "minimal" | "context" | "meters" | "vibrant" | "custom" | "ai";

export const STATUSLINE_LABELS: Record<TemplateId, string> = {
  current: "My status line",
  minimal: "Minimal",
  context: "Context",
  meters: "Usage meters",
  vibrant: "Vibrant",
  custom: "Custom",
  ai: "AI edited",
};

export function statuslineSelectionLabel(selected: string, hasCustom: boolean): string {
  if (selected === "current" && !hasCustom) return "Off";
  return STATUSLINE_LABELS[selected as TemplateId] ?? STATUSLINE_LABELS.current;
}

interface Choice {
  id: TemplateId;
  label: string;
  hint: string;
  featured?: boolean;
}

const CHOICES: Choice[] = [
  { id: "current", label: "My status line", hint: "Your existing line" },
  { id: "vibrant", label: "Vibrant", hint: "Icons, colors & meters", featured: true },
  { id: "meters", label: "Usage meters", hint: "5-hour and weekly" },
  { id: "custom", label: "Custom", hint: "Build your own" },
];

const DEFAULT_SPEC: CustomSpec = {
  segments: [
    { id: "folder", color: "cyan", text: "" },
    { id: "model", color: "magenta", text: "" },
    { id: "ctx", color: "default", text: "" },
    { id: "five", color: "default", text: "" },
    { id: "seven", color: "default", text: "" },
    { id: "cost", color: "yellow", text: "" },
  ],
  separator: "·",
  meterStyle: "blocks",
  meterWidth: 7,
  icons: true,
  gitStatus: false,
};

function sanitizeSpec(spec: CustomSpec): CustomSpec {
  return {
    ...spec,
    segments: spec.segments.filter((s) => s.id !== "text" || s.text.trim() !== ""),
  };
}

// The exact font stack lpm's terminal passes to xterm (Pane.tsx createPaneSession).
const TERMINAL_XTERM_FONT = "'SF Mono', Menlo, Monaco, 'Courier New', monospace";

type ApplyJob =
  | { kind: "template"; id: Exclude<TemplateId, "custom" | "ai"> }
  | { kind: "custom"; spec: CustomSpec }
  | { kind: "ai" };

export function ClaudeStatusLineView({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<TemplateId>("current");
  const [hasCustom, setHasCustom] = useState(false);
  const [customSpec, setCustomSpec] = useState<CustomSpec>(DEFAULT_SPEC);
  const [aiDescription, setAiDescription] = useState("");
  const [preview, setPreview] = useState("");
  const [loaded, setLoaded] = useState(false);

  // The preview must render exactly like Claude Code inside lpm's terminal, so it
  // borrows the same theme + font the real terminal uses.
  const { themeStyle } = useTerminalTheme();
  const { fontSize } = useTerminalFontSize();

  const runningRef = useRef(false);
  const queueRef = useRef<ApplyJob | null>(null);

  const refresh = async (syncSpec = false) => {
    try {
      const state = await GetClaudeStatuslineState();
      setSelected((state?.selected as TemplateId) ?? "current");
      setHasCustom(Boolean(state?.hasCustom));
      setAiDescription(state?.aiDescription ?? "");
      if (syncSpec && state?.custom) setCustomSpec(state.custom as CustomSpec);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void refresh(true);
  }, []);

  // One in-flight apply queue keeps only the latest job, so rapid custom edits
  // collapse to the last and a preset/AI click cancels any queued custom spec.
  const drain = async () => {
    runningRef.current = true;
    while (queueRef.current) {
      const job = queueRef.current;
      queueRef.current = null;
      try {
        if (job.kind === "custom") await ApplyClaudeStatuslineCustom(job.spec);
        else if (job.kind === "ai") await ApplyClaudeStatusline("ai");
        else await ApplyClaudeStatusline(job.id);
      } catch (err) {
        toast.error(String(err));
      }
    }
    runningRef.current = false;
    void refresh();
  };

  const enqueue = (job: ApplyJob) => {
    queueRef.current = job;
    if (!runningRef.current) void drain();
  };

  const aiExists = aiDescription.trim() !== "";

  const choose = (id: TemplateId) => {
    setSelected(id);
    if (id === "custom") {
      const spec = sanitizeSpec(customSpec);
      if (spec.segments.length > 0) enqueue({ kind: "custom", spec });
    } else if (id !== "ai") {
      enqueue({ kind: "template", id });
    }
  };

  const onCustomChange = (spec: CustomSpec) => {
    setCustomSpec(spec);
    const clean = sanitizeSpec(spec);
    if (clean.segments.length > 0) enqueue({ kind: "custom", spec: clean });
  };

  const previewSelection = useMemo(() => {
    switch (selected) {
      case "custom":
        return { kind: "custom", spec: sanitizeSpec(customSpec) };
      case "current":
        return { kind: "current" };
      case "ai":
        return { kind: "ai" };
      default:
        return { kind: "template", id: selected };
    }
  }, [selected, customSpec]);

  useEffect(() => {
    const sel = previewSelection;
    const handle = setTimeout(() => {
      PreviewClaudeStatusline(sel)
        .then((out: string) => setPreview(typeof out === "string" ? out : ""))
        .catch(() => setPreview(""));
    }, 180);
    return () => clearTimeout(handle);
  }, [previewSelection]);

  const emptyHint =
    selected === "current" && !hasCustom ? "Status line is off" : "Nothing to show yet";

  return (
    <div className="flex flex-1 flex-col pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Back to Settings"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">Claude Code status line</h1>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Compose the line under your agent and watch it update live.
      </p>

      <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-2xl" style={{ opacity: loaded ? 1 : 0.5 }}>
          <TerminalPreview
            text={preview}
            emptyHint={emptyHint}
            themeStyle={themeStyle}
            fontSize={fontSize}
          />

          <AiRefineBar
            selection={previewSelection}
            initialDescription={aiDescription}
            onGenerated={() => {
              setSelected("ai");
              void refresh(true);
            }}
          />

          {selected === "ai" && aiExists && (
            <div
              className="mt-3 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-1.5"
              title="Pick any option below to start over"
            >
              <span className="rounded bg-[var(--accent-green)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent-green-text)]">
                AI edited
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-muted)]">
                {aiDescription}
              </span>
            </div>
          )}

          <div className="mb-2 mt-4 flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Start from
            </span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="flex flex-wrap gap-2">
            {CHOICES.map((c) => (
              <PresetChip
                key={c.id}
                choice={c}
                active={selected === c.id}
                onClick={() => choose(c.id)}
              />
            ))}
          </div>

          {selected === "custom" && (
            <CustomStatusLineEditor spec={customSpec} onChange={onCustomChange} disabled={false} />
          )}
        </div>
      </div>
    </div>
  );
}

function TerminalPreview({
  text,
  emptyHint,
  themeStyle,
  fontSize,
}: {
  text: string;
  emptyHint: string;
  themeStyle: React.CSSProperties | undefined;
  fontSize: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Live preview
        </span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-green)]" />
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      {/* themeStyle sets the terminal CSS vars for a named theme; when the theme
          is "default" it is undefined and the ambient --terminal-* vars apply —
          exactly how TerminalView resolves colors === null. */}
      <div
        className="overflow-hidden rounded-xl border border-[var(--terminal-header-border)] shadow-sm"
        style={{ ...themeStyle, background: "var(--terminal-bg)" }}
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--terminal-header-border)] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f56" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ffbd2e" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#27c93f" }} />
          <span
            className="ml-1.5 text-[10px] tracking-wide"
            style={{ color: "var(--terminal-fg)", opacity: 0.45, fontFamily: TERMINAL_XTERM_FONT }}
          >
            claude
          </span>
        </div>
        <div className="overflow-x-auto px-4 py-3.5">
          <div
            className="whitespace-nowrap leading-relaxed"
            style={{
              color: "var(--terminal-fg)",
              fontFamily: TERMINAL_XTERM_FONT,
              fontSize: `${fontSize}px`,
            }}
          >
            <span className="mr-2 select-none" style={{ color: "var(--terminal-fg)", opacity: 0.3 }}>
              ❯
            </span>
            {text.trim() ? (
              <AnsiLine text={text} />
            ) : (
              <span style={{ color: "var(--terminal-fg)", opacity: 0.4 }}>{emptyHint}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PresetChip({
  choice,
  active,
  onClick,
}: {
  choice: Choice;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={choice.hint}
      className={`group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] ${
        active
          ? "border-[var(--accent-green)] bg-[var(--accent-green)]/8"
          : choice.featured
            ? "border-[var(--accent-blue)]/40 hover:bg-[var(--bg-hover)]"
            : "border-[var(--border)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      {choice.featured && <span aria-hidden className="text-[12px]">✦</span>}
      <span className="flex flex-col">
        <span className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{choice.label}</span>
          {choice.featured && (
            <span className="rounded-full bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-green)] px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-[0.06em] text-white">
              New
            </span>
          )}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{choice.hint}</span>
      </span>
    </button>
  );
}
