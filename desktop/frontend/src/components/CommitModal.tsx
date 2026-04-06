import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon, ChevronDownIcon } from "./icons";
import { AIButton } from "./ui/AIButton";
import {
  CheckAICLIs,
  GenerateCommitMessage,
  GitChangedFiles,
  GitCommit,
} from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { AI_CLI_OPTIONS } from "../types";

type ChangedFile = main.ChangedFile;

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  added: { label: "A", color: "text-[var(--accent-green)]" },
  untracked: { label: "U", color: "text-[var(--accent-green)]" },
  deleted: { label: "D", color: "text-[var(--accent-red)]" },
  renamed: { label: "R", color: "text-[var(--accent-cyan)]" },
  modified: { label: "M", color: "text-[var(--accent-blue)]" },
};
const DEFAULT_STATUS = STATUS_DISPLAY.modified;

interface CommitModalProps {
  open: boolean;
  projectPath: string;
  onClose: () => void;
  onCommitted: () => void;
}

export function CommitModal({
  open,
  projectPath,
  onClose,
  onCommitted,
}: CommitModalProps) {
  const [files, setFiles] = useState<ChangedFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState("claude");
  const [cliMenuOpen, setCLIMenuOpen] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const cliRef = useOutsideClick<HTMLDivElement>(
    () => setCLIMenuOpen(false),
    cliMenuOpen,
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage("");
    setFiles([]);
    setSelected(new Set());
    setLoading(true);
    GitChangedFiles(projectPath)
      .then((f) => {
        if (cancelled) return;
        const list = f || [];
        setFiles(list);
        setSelected(new Set(list.map((x) => x.path)));
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setTimeout(() => msgRef.current?.focus(), 50);
      });
    CheckAICLIs()
      .then((a) => {
        if (cancelled) return;
        const avail: Record<string, boolean> = {
          claude: a.claude,
          codex: a.codex,
          gemini: a.gemini,
          opencode: a.opencode,
        };
        setAiCLIs(avail);
        const first = AI_CLI_OPTIONS.find((o) => avail[o.value]);
        if (first) setSelectedCLI(first.value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, projectPath]);

  const toggleFile = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.path)));
    }
  };

  const parsed = useMemo(
    () =>
      files.map((f) => {
        const i = f.path.lastIndexOf("/");
        return {
          file: f,
          name: i < 0 ? f.path : f.path.slice(i + 1),
          dir: i < 0 ? "" : f.path.slice(0, i),
        };
      }),
    [files],
  );

  const generateMessage = async () => {
    if (generating || selected.size === 0) return;
    setGenerating(true);
    try {
      const msg = await GenerateCommitMessage(
        projectPath,
        selectedCLI,
        Array.from(selected),
      );
      if (msg) setMessage(msg);
    } catch (err) {
      toast.error(`AI generate failed: ${err}`);
    } finally {
      setGenerating(false);
    }
  };

  const anyAiAvailable = AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]);
  const selectedCLILabel =
    AI_CLI_OPTIONS.find((o) => o.value === selectedCLI)?.label ?? selectedCLI;

  const canCommit =
    !busy && !generating && message.trim().length > 0 && selected.size > 0;

  const submit = async () => {
    if (!canCommit) return;
    setBusy(true);
    try {
      await GitCommit(projectPath, message.trim(), Array.from(selected));
      toast.success("Committed successfully");
      onCommitted();
      onClose();
    } catch (err) {
      toast.error(`Commit failed: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy && !generating}
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[500px] max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex flex-col gap-4 p-5">
        {/* Header — minimal, no separator */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Commit
          </h3>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <XIcon />
          </button>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Message
            </span>
            {anyAiAvailable && (
              <div ref={cliRef} className="relative">
                <AIButton
                  onClick={generateMessage}
                  disabled={generating || busy || selected.size === 0}
                  loading={generating}
                  title={`Generate with ${selectedCLILabel}`}
                  trailing={<button onClick={() => setCLIMenuOpen(!cliMenuOpen)} disabled={generating || busy} title="Select AI CLI"><ChevronDownIcon /></button>}
                >
                  {generating ? "Generating..." : "Generate With AI"}
                </AIButton>
                {cliMenuOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
                    {AI_CLI_OPTIONS.filter((o) => aiCLIs[o.value]).map((o) => (
                      <button
                        key={o.value}
                        onClick={() => { setSelectedCLI(o.value); setCLIMenuOpen(false); }}
                        className={`flex w-full items-center px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
                          selectedCLI === o.value ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {o.label}
                        {selectedCLI === o.value && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <textarea
            ref={msgRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="Describe your changes..."
            disabled={busy}
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)] disabled:opacity-60"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              Changes
              <span className="ml-1 text-[var(--text-muted)]/60">
                {selected.size}/{files.length}
              </span>
            </span>
            {files.length > 0 && (
              <button
                onClick={toggleAll}
                disabled={busy}
                className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {selected.size === files.length ? "None" : "All"}
              </button>
            )}
          </div>

          <div className="max-h-[200px] min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            {loading && (
              <div className="py-5 text-center text-[11px] text-[var(--text-muted)]">
                Loading...
              </div>
            )}
            {!loading && files.length === 0 && (
              <div className="py-5 text-center text-[11px] text-[var(--text-muted)]">
                No changes
              </div>
            )}
            {!loading &&
              parsed.map(({ file, name: fileName, dir }) => {
                const checked = selected.has(file.path);
                const { label: statusLabel, color: statusClr } =
                  STATUS_DISPLAY[file.status] ?? DEFAULT_STATUS;
                return (
                  <label
                    key={file.path}
                    className={`flex cursor-pointer items-center gap-2 px-2.5 py-[5px] transition-colors hover:bg-[var(--bg-hover)] ${
                      !checked ? "opacity-50" : ""
                    }`}
                  >
                    <span
                      className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] transition-colors ${
                        checked
                          ? "bg-[var(--accent-blue)]"
                          : "border border-[var(--text-muted)]/40"
                      }`}
                    >
                      {checked && (
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFile(file.path)}
                      disabled={busy}
                      className="sr-only"
                    />
                    <span
                      className={`shrink-0 w-3 text-center text-[10px] font-bold ${statusClr}`}
                      title={file.status}
                    >
                      {statusLabel}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-primary)]">
                      {fileName}
                      {dir && (
                        <span className="text-[var(--text-muted)]"> {dir}</span>
                      )}
                    </span>
                  </label>
                );
              })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
        <span className="text-[10px] text-[var(--text-muted)]/60">
          {canCommit && (
            <kbd className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[9px] font-medium">
              &#8984;&#9166;
            </kbd>
          )}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canCommit}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
          >
            {busy ? "Committing..." : "Commit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
