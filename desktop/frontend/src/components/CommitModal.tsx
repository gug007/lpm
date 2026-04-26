import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { XIcon, ChevronDownIcon } from "./icons";
import { AIPickerButton } from "./ui/AIPickerButton";
import {
  CheckAICLIs,
  GenerateCommitMessage,
  GitChangedFiles,
  GitCommit,
  GitDiff,
  GitDiscardAll,
  GitDiscardFiles,
  GitPush,
} from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { AI_CLI_OPTIONS, aiDefaultModel, aiPickLabel, resolveAIPick, type AICLI } from "../types";
import { EventsEmit } from "../../wailsjs/runtime/runtime";
import { getSettings, saveSettings } from "../settings";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { SideBySideDiffModal } from "./SideBySideDiffModal";
import { Tooltip } from "./ui/Tooltip";

type ChangedFile = main.ChangedFile;

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
  const [busy, setBusy] = useState<false | "commit" | "push" | "discard">(false);
  const [loading, setLoading] = useState(false);
  const [confirmDiscardPath, setConfirmDiscardPath] = useState<string | null>(null);
  const [confirmDiscardAllOpen, setConfirmDiscardAllOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState<AICLI>(
    () => (getSettings().aiCli as AICLI) || "claude",
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => getSettings().aiModel ?? aiDefaultModel("claude"),
  );
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMessage("");
    setFiles([]);
    setSelected(new Set());
    setExpandedFile(null);
    setReviewOpen(false);
    setCollapsed(new Set());
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
        const s = getSettings();
        const pick = resolveAIPick(s.aiCli, s.aiModel, avail);
        if (pick) {
          setSelectedCLI(pick.cli);
          setSelectedModel(pick.model);
        }
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

  const setSelection = (paths: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (select) for (const p of paths) next.add(p);
      else for (const p of paths) next.delete(p);
      return next;
    });
  };

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
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

  const reloadFiles = async () => {
    const f = await GitChangedFiles(projectPath);
    const list = f || [];
    setFiles(list);
    const valid = new Set(list.map((x) => x.path));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const p of prev) if (valid.has(p)) next.add(p);
      return next;
    });
    setExpandedFile((prev) => (prev && valid.has(prev) ? prev : null));
  };

  const runDiscard = async (op: () => Promise<void>, successMsg: string) => {
    if (busy) return;
    setBusy("discard");
    try {
      await op();
      await reloadFiles();
      onCommitted();
      toast.success(successMsg);
    } catch (err) {
      toast.error(`Discard failed: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  const discardPath = (path: string) =>
    runDiscard(() => GitDiscardFiles(projectPath, [path]), `Discarded ${path}`);

  const discardAll = () =>
    runDiscard(() => GitDiscardAll(projectPath), "Discarded all changes");

  const generateMessage = async () => {
    if (generating || selected.size === 0) return;
    setGenerating(true);
    try {
      const msg = await GenerateCommitMessage(
        projectPath,
        selectedCLI,
        selectedModel,
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

  const selectedCLILabel = aiPickLabel(selectedCLI, selectedModel);

  const selectAI = (cli: AICLI, model: string) => {
    setSelectedCLI(cli);
    setSelectedModel(model);
    saveSettings({ aiCli: cli, aiModel: model });
  };

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
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
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

        <div
          className={`relative rounded-xl transition-all ${
            generating
              ? "p-[1px] [background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)] animate-[gradient-spin_3s_linear_infinite]"
              : "border border-[var(--border)] focus-within:border-[var(--text-muted)]/60"
          }`}
        >
          <div className="flex flex-col rounded-[calc(0.75rem-1px)] bg-[var(--bg-secondary)]">
            <textarea
              ref={msgRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Describe your changes..."
              disabled={!!busy}
              rows={3}
              style={MSG_MAX_HEIGHT}
              className={`w-full resize-none bg-transparent px-3.5 pt-3 text-sm leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                anyAiAvailable ? "pb-1.5" : "pb-3"
              }`}
            />
            {anyAiAvailable && (
              <div className="flex items-center justify-end px-2 pb-2">
                <AIPickerButton
                  onGenerate={generateMessage}
                  generating={generating}
                  disabled={generating || !!busy || selected.size === 0}
                  title={`Generate with ${selectedCLILabel}`}
                  label="Generate with AI"
                  aiCLIs={aiCLIs}
                  selectedCLI={selectedCLI}
                  selectedModel={selectedModel}
                  onSelect={selectAI}
                />
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Changes
              <span className="ml-1 text-[var(--text-muted)]">
                {selected.size}/{files.length}
              </span>
            </span>
            {files.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setReviewOpen(true)}
                  disabled={!!busy || selected.size === 0}
                  className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  Review
                </button>
                <button
                  onClick={toggleAll}
                  disabled={!!busy}
                  className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                >
                  {selected.size === files.length ? "None" : "All"}
                </button>
                <button
                  onClick={() => setConfirmDiscardAllOpen(true)}
                  disabled={!!busy}
                  title="Reset the working tree to HEAD, discarding every uncommitted change"
                  className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--accent-red-text)] disabled:opacity-40"
                >
                  Discard all
                </button>
              </div>
            )}
          </div>

          <div className="max-h-[300px] min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
            {loading && (
              <div className="py-5 text-center text-xs text-[var(--text-muted)]">
                Loading...
              </div>
            )}
            {!loading && files.length === 0 && (
              <div className="py-5 text-center text-xs text-[var(--text-muted)]">
                No changes
              </div>
            )}
            {!loading && files.length > 0 && (
              <ChangedFilesTree
                files={files}
                selected={selected}
                collapsed={collapsed}
                expandedFile={expandedFile}
                diffContent={diffContent}
                diffLoading={diffLoading}
                busy={!!busy}
                onToggleFile={toggleFile}
                onSetSelection={setSelection}
                onToggleCollapse={toggleCollapse}
                onClickFile={toggleDiff}
                onDiscardFile={setConfirmDiscardPath}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
        <span className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
          {canCommit && (
            <kbd className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              &#8984;&#9166;
            </kbd>
          )}
          {anyAiAvailable && (
            <Tooltip content="Auto-generate commit message on open" side="top" align="start">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
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
            className="text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            Edit AI Instructions
          </button>
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={!!busy}
            className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            Cancel
          </button>
          <div ref={commitMenuRef} className="relative flex">
            <button
              onClick={() => submit(false)}
              disabled={!canCommit}
              className="rounded-l-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
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
                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
        files={files}
        selected={selected}
        onToggleFile={toggleFile}
        onSetSelection={setSelection}
      />,
      document.body,
    )}
    <ConfirmDialog
      open={confirmDiscardPath !== null}
      title="Discard changes"
      variant="destructive"
      confirmLabel="Discard"
      disabled={busy === "discard"}
      body={
        <>
          Discard changes to{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {confirmDiscardPath}
          </span>
          ? This cannot be undone.
        </>
      }
      onCancel={() => setConfirmDiscardPath(null)}
      onConfirm={() => {
        const path = confirmDiscardPath;
        setConfirmDiscardPath(null);
        if (path) discardPath(path);
      }}
    />
    <ConfirmDialog
      open={confirmDiscardAllOpen}
      title="Discard all changes"
      variant="destructive"
      confirmLabel="Discard all"
      disabled={busy === "discard"}
      body={
        <>
          Reset the working tree to HEAD, discarding every uncommitted change
          (staged, unstaged, and untracked). This cannot be undone.
        </>
      }
      onCancel={() => setConfirmDiscardAllOpen(false)}
      onConfirm={() => {
        setConfirmDiscardAllOpen(false);
        discardAll();
      }}
    />
    </>
  );
}
