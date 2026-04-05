import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/Modal";
import { CLIOption } from "./CLIOption";
import { CheckAICLIs } from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import type { main } from "../../wailsjs/go/models";

export type AICLI = "claude" | "codex" | "gemini" | "opencode";

const DEFAULT_PROMPT = "Detect services and add useful actions, keep it simple.";
const MAX_PROGRESS_LINES = 500;

const CLI_OPTIONS: { value: AICLI; label: string }[] = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "opencode", label: "OpenCode" },
];

interface AIGenerateModalProps {
  open: boolean;
  onCancel: () => void;
  onGenerate: (cli: AICLI, extraPrompt: string) => Promise<void>;
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
        const firstAvailable = CLI_OPTIONS.find((o) => a[o.value]);
        if (firstAvailable) setCli(firstAvailable.value);
      })
      .catch((err) => setError(`Failed to check CLIs: ${err}`));
  }, [open]);

  const selectedAvailable = availability?.[cli] ?? false;
  const noneAvailable =
    availability && CLI_OPTIONS.every((o) => !availability[o.value]);

  const handleGenerate = async () => {
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
        Generate config with AI
      </h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Runs in the project root and writes config to the editor. Review before saving.
      </p>

      <div className="mt-5">
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          CLI
        </label>
        <div className="grid grid-cols-2 gap-2">
          {CLI_OPTIONS.map((opt) => (
            <CLIOption
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

      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
          Instructions for the AI
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          spellCheck={false}
          rows={4}
          disabled={running}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--text-muted)] disabled:opacity-60"
          placeholder="e.g. Only include backend services, ignore docker-compose"
        />
      </div>

      {(running || progress.length > 0) && (
        <div className="mt-4 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
          {progress.length === 0 ? (
            <div className="text-[var(--text-muted)]">Starting{"\u2026"}</div>
          ) : (
            progress.map((line, i) => (
              <div key={i} className="truncate">
                {line}
              </div>
            ))
          )}
          <div ref={progressEndRef} />
        </div>
      )}

      {error && (
        <p className="mt-3 whitespace-pre-wrap rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/10 p-2 text-xs text-[var(--accent-red)]">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={running}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleGenerate}
          disabled={running || !selectedAvailable}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
        >
          {running ? "Generating\u2026" : "Generate"}
        </button>
      </div>
    </Modal>
  );
}

