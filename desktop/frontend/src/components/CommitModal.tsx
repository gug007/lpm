import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { XIcon, ChevronDownIcon, ChevronRightIcon, LayersIcon, ClipboardIcon } from "./icons";
import { AIPickerButton } from "./ui/AIPickerButton";
import {
  GenerateCommitMessage,
  GitChangedFiles,
  GitCommit,
  GitDiff,
  GitDiscardFiles,
  GitPush,
} from "../../bridge/commands";
import { main } from "../../bridge/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useAIPicker } from "../hooks/useAIPicker";
import { aiEffectiveFast } from "../types";
import { EventsEmit } from "../../bridge/runtime";
import { getSettings, saveSettings } from "../store/settings";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { SideBySideDiffModal } from "./SideBySideDiffModal";
import { Tooltip } from "./ui/Tooltip";

type ChangedFile = main.ChangedFile;

const MSG_MAX_HEIGHT = { maxHeight: "calc(5 * 1.5em + 1rem)" };
const TASK_MAX_HEIGHT = { maxHeight: "calc(6 * 1.5em)" };

interface CommitModalProps {
  open: boolean;
  projectName: string;
  projectPath: string;
  onClose: () => void;
  onCommitted: () => void;
}

export function CommitModal({
  open,
  projectName,
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
  const [confirmDiscardFolder, setConfirmDiscardFolder] = useState<{
    name: string;
    paths: string[];
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const ai = useAIPicker(open);
  const [commitMenuOpen, setCommitMenuOpen] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [taskDescription, setTaskDescription] = useState("");
  const msgRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<HTMLTextAreaElement>(null);
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
    setShowContext(false);
    setTaskDescription("");
    setLoading(true);
    GitChangedFiles(projectPath)
      .then((f) => {
        if (cancelled) return;
        const list = f || [];
        setFiles(list);
        setSelected(new Set(list.map((x: any) => x.path)));
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setTimeout(() => msgRef.current?.focus(), 50);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectPath]);

  const autoGenTriggered = useRef(false);

  useEffect(() => {
    if (!open) {
      autoGenTriggered.current = false;
      return;
    }
    if (autoGenTriggered.current || !autoGenerate) return;
    if (loading || files.length === 0) return;
    if (!ai.anyAvailable) return;
    autoGenTriggered.current = true;
    generateMessage();
  }, [open, loading, files, ai.anyAvailable, autoGenerate]);

  useEffect(() => {
    const el = msgRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [message]);

  useEffect(() => {
    const el = contextRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [taskDescription, showContext]);

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
    const valid = new Set(list.map((x: any) => x.path));
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

  const discardFolder = (name: string, paths: string[]) =>
    runDiscard(
      () => GitDiscardFiles(projectPath, paths),
      `Discarded ${paths.length} file${paths.length !== 1 ? "s" : ""} in ${name}`,
    );

  const generateMessage = async () => {
    if (generating || selected.size === 0) return;
    setGenerating(true);
    try {
      const msg = await GenerateCommitMessage(
        projectName,
        projectPath,
        ai.selectedCLI,
        ai.selectedModel,
        ai.selectedEffort,
        aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
        Array.from(selected),
        taskDescription.trim(),
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

  const toggleContext = () => {
    setShowContext((prev) => {
      if (!prev) setTimeout(() => contextRef.current?.focus(), 0);
      return !prev;
    });
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
                ai.anyAvailable ? "pb-1.5" : "pb-3"
              }`}
            />
            {ai.anyAvailable && showContext && (
              <div className="flex items-start gap-2 border-t border-[var(--border)]/70 px-3.5 py-2">
                <span className="shrink-0 pt-0.5 text-[var(--text-muted)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                  <ClipboardIcon />
                </span>
                <textarea
                  ref={contextRef}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="Describe the task to guide the message…"
                  aria-label="Task description"
                  disabled={!!busy}
                  rows={1}
                  style={TASK_MAX_HEIGHT}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full resize-none bg-transparent text-[13px] leading-[1.5] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
                />
                {taskDescription && (
                  <button
                    onClick={() => {
                      setTaskDescription("");
                      contextRef.current?.focus();
                    }}
                    disabled={!!busy}
                    aria-label="Clear task description"
                    className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 [&>svg]:h-3 [&>svg]:w-3"
                  >
                    <XIcon />
                  </button>
                )}
              </div>
            )}
            {ai.anyAvailable && (
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <button
                  onClick={toggleContext}
                  disabled={!!busy || generating}
                  aria-expanded={showContext}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    showContext
                      ? "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <span
                    className={`transition-transform [&>svg]:h-3 [&>svg]:w-3 ${
                      showContext ? "rotate-90" : ""
                    }`}
                  >
                    <ChevronRightIcon />
                  </span>
                  Task description
                  {!showContext && taskDescription.trim().length > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
                  )}
                </button>
                <AIPickerButton
                  onGenerate={generateMessage}
                  generating={generating}
                  disabled={generating || !!busy || selected.size === 0}
                  title={`Generate with ${ai.cliLabel}`}
                  label="Generate with AI"
                  aiCLIs={ai.aiCLIs}
                  selectedCLI={ai.selectedCLI}
                  selectedModel={ai.selectedModel}
                  selectedEffort={ai.selectedEffort}
                  selectedFast={ai.selectedFast}
                  onSelect={ai.selectAI}
                  onSelectEffort={ai.selectEffort}
                  onSelectFast={ai.selectFast}
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
              <button
                onClick={() => setReviewOpen(true)}
                disabled={!!busy || selected.size === 0}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-all hover:border-[var(--text-muted)]/40 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-3 [&>svg]:w-3"
              >
                <LayersIcon />
                Review Changes
              </button>
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
                onDiscardFolder={setConfirmDiscardFolder}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
        <span className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
          {canCommit && (
            <kbd className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              &#8984;&#9166;
            </kbd>
          )}
          {ai.anyAvailable && (
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
      open={confirmDiscardFolder !== null}
      title="Discard changes"
      variant="destructive"
      confirmLabel="Discard"
      disabled={busy === "discard"}
      body={
        <>
          Discard changes to{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {confirmDiscardFolder?.paths.length} file
            {confirmDiscardFolder?.paths.length !== 1 ? "s" : ""}
          </span>{" "}
          in{" "}
          <span className="font-medium text-[var(--text-primary)]">
            {confirmDiscardFolder?.name}
          </span>
          ? This cannot be undone.
        </>
      }
      onCancel={() => setConfirmDiscardFolder(null)}
      onConfirm={() => {
        const folder = confirmDiscardFolder;
        setConfirmDiscardFolder(null);
        if (folder) discardFolder(folder.name, folder.paths);
      }}
    />
    </>
  );
}
