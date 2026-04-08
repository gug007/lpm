import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon, ChevronDownIcon } from "./icons";
import { AIButton } from "./ui/AIButton";
import {
  CheckAICLIs,
  GenerateCommitMessage,
  GitChangedFiles,
  GitCommit,
  GitDiff,
  GitPush,
} from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { AI_CLI_OPTIONS } from "../types";
import { EventsEmit } from "../../wailsjs/runtime/runtime";
import { getSettings, saveSettings } from "../settings";
import { DiffViewer } from "./DiffViewer";
import { SideBySideDiffModal } from "./SideBySideDiffModal";
import { Tooltip } from "./ui/Tooltip";

type ChangedFile = main.ChangedFile;

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  added: { label: "A", color: "text-[var(--accent-green)]" },
  untracked: { label: "U", color: "text-[var(--accent-green)]" },
  deleted: { label: "D", color: "text-[var(--accent-red)]" },
  renamed: { label: "R", color: "text-[var(--accent-cyan)]" },
  modified: { label: "M", color: "text-[var(--accent-blue)]" },
};
const DEFAULT_STATUS = STATUS_DISPLAY.modified;
const MSG_MAX_HEIGHT = { maxHeight: "calc(5 * 1.5em + 1rem)" };

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
  const [busy, setBusy] = useState<false | "commit" | "push">(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState("claude");
  const [cliMenuOpen, setCLIMenuOpen] = useState(false);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const cliRef = useOutsideClick<HTMLDivElement>(
    () => setCLIMenuOpen(false),
    cliMenuOpen,
  );
  const commitMenuRef = useOutsideClick<HTMLDivElement>(
    () => setCommitMenuOpen(false),
    commitMenuOpen,
  );
  const [autoGenerate, setAutoGenerate] = useState(
    () => getSettings().autoGenerateCommitMessage ?? false,
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage("");
    setFiles([]);
    setSelected(new Set());
    setExpandedFile(null);
    setReviewOpen(false);
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

  const anyAiAvailable = AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]);
  const autoGenTriggered = useRef(false);

  useEffect(() => {
    if (!open) {
      autoGenTriggered.current = false;
      return;
    }
    if (autoGenTriggered.current || !autoGenerate) return;
    if (loading || files.length === 0) return;
    if (!anyAiAvailable) return;
    autoGenTriggered.current = true;
    generateMessage();
  }, [open, loading, files, anyAiAvailable, autoGenerate]);

  useEffect(() => {
    const el = msgRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [message]);

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

  const toggleDiff = async (path: string) => {
    if (expandedFile === path) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(path);
    setDiffLoading(true);
    try {
      const diff = await GitDiff(projectPath, [path]);
      setDiffContent(diff);
    } catch {
      setDiffContent("Failed to load diff");
    } finally {
      setDiffLoading(false);
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

  const toggleAutoGenerate = () => {
    const next = !autoGenerate;
    setAutoGenerate(next);
    saveSettings({ autoGenerateCommitMessage: next });
  };

  const selectedCLILabel =
    AI_CLI_OPTIONS.find((o) => o.value === selectedCLI)?.label ?? selectedCLI;

  const selectedFiles = useMemo(() => Array.from(selected), [selected]);

  const canCommit =
    !busy && !generating && message.trim().length > 0 && selected.size > 0;

  const submit = async (andPush = false) => {
    if (!canCommit) return;
    setBusy("commit");
    try {
      await GitCommit(projectPath, message.trim(), Array.from(selected));
      if (andPush) {
        setBusy("push");
        await GitPush(projectPath);
        toast.success("Committed and pushed");
      } else {
        toast.success("Committed successfully");
      }
      onCommitted();
      onClose();
    } catch (err) {
      toast.error(`${andPush ? "Commit & push" : "Commit"} failed: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy && !generating}
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[640px] max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Commit
          </h3>
          <button
            onClick={onClose}
            disabled={!!busy}
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
                  disabled={generating || !!busy || selected.size === 0}
                  loading={generating}
                  title={`Generate with ${selectedCLILabel}`}
                  trailing={<button onClick={() => setCLIMenuOpen(!cliMenuOpen)} disabled={generating || !!busy} title="Select AI CLI"><ChevronDownIcon /></button>}
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
          <div className={generating ? "relative rounded-lg p-[1.5px] [background:conic-gradient(from_var(--gradient-angle),#3b82f6,#8b5cf6,#ec4899,#06b6d4,#6366f1,#3b82f6)] animate-[gradient-spin_2s_linear_infinite]" : ""}>
            <textarea
              ref={msgRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Describe your changes..."
              disabled={!!busy}
              rows={2}
              style={MSG_MAX_HEIGHT}
              className={`w-full resize-none bg-[var(--bg-secondary)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                generating ? "block rounded-[calc(0.5rem-1.5px)] border-none" : "rounded-lg border border-[var(--border)] focus:border-[var(--text-muted)]"
              }`}
            />
          </div>
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReviewOpen(true)}
                  disabled={!!busy || selected.size === 0}
                  className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Review
                </button>
                <button
                  onClick={toggleAll}
                  disabled={!!busy}
                  className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  {selected.size === files.length ? "None" : "All"}
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[300px] min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
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
                const isExpanded = expandedFile === file.path;
                return (
                  <div key={file.path}>
                    <div
                      className={`flex items-center gap-2 px-2.5 py-[5px] transition-colors hover:bg-[var(--bg-hover)] ${
                        !checked ? "opacity-50" : ""
                      }`}
                    >
                      <label className="flex shrink-0 cursor-pointer items-center">
                        <span
                          className={`flex h-3 w-3 items-center justify-center rounded-[3px] transition-colors ${
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
                          disabled={!!busy}
                          className="sr-only"
                        />
                      </label>
                      <span
                        className={`shrink-0 w-3 text-center text-[10px] font-bold ${statusClr}`}
                        title={file.status}
                      >
                        {statusLabel}
                      </span>
                      <span
                        onClick={() => toggleDiff(file.path)}
                        className="min-w-0 flex-1 cursor-pointer truncate text-[11px] text-[var(--text-primary)]"
                      >
                        {fileName}
                        {dir && (
                          <span className="text-[var(--text-muted)]"> {dir}</span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 text-[9px] text-[var(--text-muted)] transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                      >
                        &#9654;
                      </span>
                    </div>
                    {isExpanded && (
                      <DiffViewer diff={diffContent} loading={diffLoading} filePath={file.path} />
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
        <span className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]/60">
          {canCommit && (
            <kbd className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[9px] font-medium">
              &#8984;&#9166;
            </kbd>
          )}
          {anyAiAvailable && (
            <Tooltip content="Auto-generate commit message on open" side="top" align="start">
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={autoGenerate}
                  onChange={toggleAutoGenerate}
                  className="accent-[var(--accent-blue)] h-3 w-3"
                />
                Auto-generate
              </label>
            </Tooltip>
          )}
          <button
            onClick={() => { EventsEmit("navigate-commit-instructions"); onClose(); }}
            className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Edit AI Instructions
          </button>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={!!busy}
            className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            Cancel
          </button>
          <div ref={commitMenuRef} className="relative flex">
            <button
              onClick={() => submit(false)}
              disabled={!canCommit}
              className="rounded-l-lg bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
            >
              {busy === "push" ? "Pushing..." : busy === "commit" ? "Committing..." : "Commit"}
            </button>
            <button
              onClick={() => setCommitMenuOpen(!commitMenuOpen)}
              disabled={!canCommit}
              className="rounded-r-lg border-l border-[var(--bg-primary)]/20 bg-[var(--text-primary)] px-1.5 py-1.5 text-[var(--bg-primary)]/70 transition-all hover:text-[var(--bg-primary)] hover:opacity-90 disabled:opacity-30"
            >
              <ChevronDownIcon />
            </button>
            {commitMenuOpen && (
              <div className="absolute bottom-full right-0 z-10 mb-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
                {([
                  { label: "Commit", push: false },
                  { label: "Commit and Push", push: true },
                ] as const).map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => { setCommitMenuOpen(false); submit(opt.push); }}
                    className="flex w-full items-center px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
    {createPortal(
      <SideBySideDiffModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        projectPath={projectPath}
        files={selectedFiles}
      />,
      document.body,
    )}
    </>
  );
}
