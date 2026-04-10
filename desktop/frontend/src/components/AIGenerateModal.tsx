import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { CheckAICLIs } from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import type { main } from "../../wailsjs/go/models";

import { type AICLI, AI_CLI_OPTIONS } from "../types";

const DEFAULT_PROMPT = "Detect services and add useful actions, keep it simple.";
const MAX_PROGRESS_LINES = 500;

const PRESETS: { label: string; prompt: string }[] = [
  { label: "Detect services", prompt: DEFAULT_PROMPT },
  { label: "Common actions", prompt: "Add common actions (build, test, deploy, lint) and a default profile." },
  { label: "Minimal", prompt: "Minimal config: just detect services, no actions or profiles." },
];

interface AIGenerateModalProps {
  open: boolean;
  onCancel: () => void;
  onGenerate: (cli: AICLI, extraPrompt: string) => Promise<void>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

function CLIChip({
  label,
  selected,
  available,
  onSelect,
}: {
  label: string;
  selected: boolean;
  available: boolean | null;
  onSelect: () => void;
}) {
  const disabled = available === false;
  const dotColor =
    available === null
      ? "bg-[var(--text-muted)] opacity-50"
      : available
        ? "bg-[var(--accent-green)]"
        : "bg-[var(--text-muted)] opacity-40";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={available === false ? "Not installed" : undefined}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
        disabled
          ? "cursor-not-allowed border-[var(--border)] text-[var(--text-muted)] opacity-50"
          : selected
            ? "border-[var(--text-primary)] bg-[var(--bg-hover)] text-[var(--text-primary)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label}
    </button>
  );
}

export function AIGenerateModal({ open, onCancel, onGenerate }: AIGenerateModalProps) {
  const [availability, setAvailability] = useState<main.AICLIAvailability | null>(null);
  const [cli, setCli] = useState<AICLI>("claude");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const progressEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cancel = EventsOn("ai-generate-output", (line: string) => {
      setProgress((prev) =>
        prev.length >= MAX_PROGRESS_LINES
          ? [...prev.slice(-(MAX_PROGRESS_LINES - 1)), line]
          : [...prev, line],
      );
    });
    return cancel;
  }, []);

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [progress]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setProgress([]);
    CheckAICLIs()
      .then((a) => {
        setAvailability(a);
        const firstAvailable = AI_CLI_OPTIONS.find((o) => a[o.value]);
        if (firstAvailable) setCli(firstAvailable.value);
      })
      .catch((err) => setError(`Failed to check CLIs: ${err}`));
  }, [open]);

  const selectedAvailable = availability?.[cli] ?? false;
  const noneAvailable =
    availability && AI_CLI_OPTIONS.every((o) => !availability[o.value]);

  const handleGenerate = async () => {
    if (running || !selectedAvailable) return;
    setRunning(true);
    setError(null);
    setProgress([]);
    try {
      await onGenerate(cli, prompt);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={running ? () => {} : onCancel}
      closeOnBackdrop={!running}
      zIndexClassName="z-[60]"
      contentClassName="w-[480px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-xl"
    >
      <h3 className="text-base font-semibold text-[var(--text-primary)]">
        Generate with AI
      </h3>

      <div className="mt-5">
        <SectionLabel>CLI</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {AI_CLI_OPTIONS.map((opt) => (
            <CLIChip
              key={opt.value}
              label={opt.label}
              selected={cli === opt.value}
              available={availability?.[opt.value] ?? null}
              onSelect={() => availability?.[opt.value] && setCli(opt.value)}
            />
          ))}
        </div>
        {noneAvailable && (
          <p className="mt-2 text-xs text-[var(--accent-red)]">
            No AI CLI is installed. Install Claude Code, Codex, Gemini CLI, or OpenCode and reopen.
          </p>
        )}
      </div>

      <div className="mt-5">
        <SectionLabel>Instructions</SectionLabel>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setPrompt(p.prompt)}
              disabled={running}
              className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              {p.label}
            </button>
          ))}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleGenerate();
            }
          }}
          spellCheck={false}
          rows={3}
          disabled={running}
          className="w-full resize-none border-b border-[var(--border)] bg-transparent px-0.5 pb-1.5 font-mono text-xs text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)] disabled:opacity-60"
          placeholder="e.g. Only include backend services, ignore docker-compose"
        />
      </div>

      {(running || progress.length > 0) && (
        <div className="mt-4 max-h-40 overflow-y-auto rounded-md bg-[var(--bg-secondary)] p-2 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
          {progress.length === 0 ? (
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent-green)]" />
              Starting{"\u2026"}
            </div>
          ) : (
            progress.map((line, i) => (
              <div key={i} className="whitespace-nowrap">
                {line}
              </div>
            ))
          )}
          <div ref={progressEndRef} />
        </div>
      )}

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-[var(--accent-red)]/10 p-2 text-xs text-[var(--accent-red)]">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <div className="text-[11px] text-[var(--text-muted)]">
          <kbd className="font-mono">{"\u2318\u21B5"}</kbd> Generate
          <span className="mx-1.5">·</span>
          <kbd className="font-mono">Esc</kbd> Cancel
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={running}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={running || !selectedAvailable}
            className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
          >
            {running ? "Generating\u2026" : "Generate"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
