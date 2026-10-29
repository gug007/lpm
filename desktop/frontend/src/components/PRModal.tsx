import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../notifications/toast";
import { ArrowRight, GitPullRequest, AlertCircle } from "lucide-react";
import { Modal } from "./ui/Modal";
import { XIcon, BranchIcon } from "./icons";
import { AIPickerButton } from "./ui/AIPickerButton";
import {
  CheckGHCLI,
  CreatePullRequest,
  GeneratePRTitle,
  GeneratePRDescription,
  GitDefaultBranch,
  GitLogBranch,
  ListBranches,
} from "../../bridge/commands";
import { main } from "../../bridge/models";
import { useAIPicker } from "../hooks/useAIPicker";
import { isCanceledError, useAIGeneration } from "../hooks/useAIGeneration";
import { aiEffectiveFast } from "../types";
import { saveSettings, useSettingsStore } from "../store/settings";
import { rememberCreatedPr } from "../store/branchPr";
import { prefersDraftPr, rememberDraftPr } from "../store/prDraft";
import { Tooltip } from "./ui/Tooltip";
import { PRCreatedView } from "./PRCreatedView";
import { BranchPicker } from "./BranchPicker";
import { CreatePRSplitButton } from "./CreatePRSplitButton";
import { InstructionsChip } from "./InstructionsChip";

type BranchCommit = main.BranchCommit;
type Branch = main.Branch;

const TITLE_MAX_HEIGHT = { maxHeight: "calc(3 * 1.4em + 0.5rem)" };
const DESC_MAX_HEIGHT = { maxHeight: "50vh" };

interface PRModalProps {
  open: boolean;
  projectName: string;
  projectPath: string;
  currentBranch: string;
  onClose: () => void;
  onCreated: () => void;
}

export function PRModal({
  open,
  projectName,
  projectPath,
  currentBranch,
  onClose,
  onCreated,
}: PRModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [base, setBase] = useState("");
  const [commits, setCommits] = useState<BranchCommit[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const titleGen = useAIGeneration(projectName);
  const descGen = useAIGeneration(projectName);
  const [ghAvailable, setGhAvailable] = useState(true);
  const ai = useAIPicker(open, projectName);
  const [branches, setBranches] = useState<Branch[]>([]);
  const excludeCurrent = useCallback(
    (b: Branch) => b.name !== currentBranch,
    [currentBranch],
  );
  const autoGenerate = useSettingsStore((s) => s.autoGeneratePRDescription ?? false);
  const [draft, setDraft] = useState(false);
  const [prURL, setPrURL] = useState("");

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTitle("");
    setDescription("");
    setBase("");
    setCommits([]);
    setBranches([]);
    setPrURL("");
    setDraft(prefersDraftPr(projectName));
    setLoading(true);

    (async () => {
      try {
        const [defaultBranch, ghOk, branchList] = await Promise.all([
          GitDefaultBranch(projectPath),
          CheckGHCLI(),
          ListBranches(projectPath).catch(() => [] as Branch[]),
        ]);
        if (cancelled) return;
        setBase(defaultBranch);
        setGhAvailable(ghOk);
        setBranches(branchList.filter((b: any) => b.name !== currentBranch));

        const log = await GitLogBranch(projectPath, defaultBranch);
        if (cancelled) return;
        setCommits(log || []);
      } catch {
        if (!cancelled) setCommits([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setTimeout(() => titleRef.current?.focus(), 50);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, projectPath, projectName, currentBranch]);

  const autoGenTriggered = useRef(false);

  const generatingTitle = titleGen.generating;
  const generatingDesc = descGen.generating;
  const generating = generatingTitle || generatingDesc;

  useEffect(() => {
    if (!open) {
      autoGenTriggered.current = false;
      return;
    }
    if (autoGenTriggered.current || !autoGenerate) return;
    if (loading || commits.length === 0 || !base) return;
    if (!ai.anyAvailable) return;
    autoGenTriggered.current = true;
    generateTitle();
    generateDesc();
  }, [open, loading, commits, base, ai.anyAvailable, autoGenerate]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [title]);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [description]);

  const changeBase = async (newBase: string) => {
    setBase(newBase);
    setLoading(true);
    try {
      const log = await GitLogBranch(projectPath, newBase);
      setCommits(log || []);
    } catch {
      setCommits([]);
    } finally {
      setLoading(false);
    }
  };

  const generateTitle = async () => {
    if (generatingTitle || !base) return;
    try {
      const result = await titleGen.run((genId) =>
        GeneratePRTitle(
          projectName,
          projectPath,
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          base,
          genId,
        ),
      );
      if (result) setTitle(result);
    } catch (err) {
      if (!isCanceledError(err)) toast.error(`Title generation failed: ${err}`);
    }
  };

  const generateDesc = async () => {
    if (generatingDesc || !base) return;
    try {
      const result = await descGen.run((genId) =>
        GeneratePRDescription(
          projectName,
          projectPath,
          ai.selectedCLI,
          ai.selectedModel,
          ai.selectedEffort,
          aiEffectiveFast(ai.selectedCLI, ai.selectedModel, ai.selectedFast),
          base,
          genId,
        ),
      );
      if (result) setDescription(result);
    } catch (err) {
      if (!isCanceledError(err)) toast.error(`Description generation failed: ${err}`);
    }
  };

  // Title and description run independently, so leaving stops whichever is live.
  const closeModal = () => {
    titleGen.cancel();
    descGen.cancel();
    onClose();
  };

  const toggleAutoGenerate = () => {
    void saveSettings({ autoGeneratePRDescription: !autoGenerate });
  };

  const canCreate =
    !busy &&
    !loading &&
    !generating &&
    title.trim().length > 0 &&
    ghAvailable &&
    commits.length > 0;

  const sameBranch = !!base && base === currentBranch;

  const noChangesReason =
    commits.length > 0
      ? null
      : sameBranch
        ? `Comparing ${base} with itself — pick a different base branch.`
        : `No commits ahead of ${base || "base"} to include.`;

  const createDisabledReason = (() => {
    if (busy || loading || !ghAvailable) return null;
    if (noChangesReason) return noChangesReason;
    if (generating) return null;
    if (title.trim().length === 0) return "Add a title to create the PR.";
    return null;
  })();

  const submit = async (asDraft = draft) => {
    if (!canCreate) return;
    setDraft(asDraft);
    rememberDraftPr(projectName, asDraft);
    setBusy(true);
    try {
      const url = await CreatePullRequest(
        projectPath,
        title.trim(),
        description.trim(),
        base,
        asDraft,
      );
      setPrURL(url);
      rememberCreatedPr(projectPath, currentBranch, url, title.trim(), asDraft);
      onCreated();
    } catch (err) {
      toast.error(`Create PR failed: ${err}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={closeModal}
      backdrop={false}
      draggable
      closeOnEscape={!busy}
      zIndexClassName="z-[60]"
      contentClassName="w-[640px] max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        data-modal-drag-handle
        className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <GitPullRequest size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Create Pull Request
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            Open a pull request to merge your changes on GitHub.
          </p>
        </div>
        <button
          onClick={closeModal}
          disabled={busy}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
        {!ghAvailable && (
          <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-3 py-2 text-xs text-[var(--accent-red-text)]">
            GitHub CLI (gh) not found. Install it from{" "}
            <span className="font-medium">https://cli.github.com</span> and run{" "}
            <code className="rounded bg-[var(--bg-hover)] px-1">
              gh auth login
            </code>
          </div>
        )}

        {prURL ? (
          <PRCreatedView
            projectPath={projectPath}
            branch={currentBranch}
            base={base}
            url={prURL}
            draft={draft}
            onSwitched={() => {
              onCreated();
              closeModal();
            }}
            onBusyChange={setBusy}
          />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                <BranchIcon size={11} />
                <span className="max-w-[180px] truncate">{currentBranch}</span>
              </span>
              <ArrowRight
                size={14}
                className="shrink-0 text-[var(--text-muted)]"
              />
              <BranchPicker
                projectPath={projectPath}
                label={base}
                branches={branches}
                filter={excludeCurrent}
                isSelected={(b) => b.name === base}
                onSelect={(b) => changeBase(b.name)}
                disabled={busy}
              />
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
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="PR title"
                  disabled={busy}
                  rows={1}
                  style={TITLE_MAX_HEIGHT}
                  aria-label="Pull request title"
                  className="w-full resize-none overflow-hidden bg-transparent px-3.5 pt-3 pb-2 text-base font-semibold leading-[1.4] text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-muted)] disabled:opacity-60"
                />
                <div className="mx-3.5 border-t border-[var(--border)]/70" />
                <textarea
                  ref={descRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="Leave a description..."
                  disabled={busy}
                  rows={12}
                  style={DESC_MAX_HEIGHT}
                  aria-label="Pull request description"
                  className={`w-full resize-none bg-transparent px-3.5 pt-2.5 text-sm leading-[1.6] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                    ai.anyAvailable ? "pb-1.5" : "pb-3"
                  }`}
                />
                {ai.anyAvailable && (
                  <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
                    <AIPickerButton
                      onGenerate={generateTitle}
                      onCancel={titleGen.cancel}
                      generating={generatingTitle}
                      disabled={
                        generatingTitle || busy || !base || commits.length === 0
                      }
                      title={
                        noChangesReason ?? `Generate title with ${ai.cliLabel}`
                      }
                      label="Generate Title"
                      generatingLabel="Generating title..."
                      aiCLIs={ai.aiCLIs}
                      selectedCLI={ai.selectedCLI}
                      selectedModel={ai.selectedModel}
                      selectedEffort={ai.selectedEffort}
                      selectedFast={ai.selectedFast}
                      onSelect={ai.selectAI}
                      onSelectEffort={ai.selectEffort}
                      onSelectFast={ai.selectFast}
                    />
                    <AIPickerButton
                      onGenerate={generateDesc}
                      onCancel={descGen.cancel}
                      generating={generatingDesc}
                      disabled={
                        generatingDesc || busy || !base || commits.length === 0
                      }
                      title={
                        noChangesReason ??
                        `Generate description with ${ai.cliLabel}`
                      }
                      label="Generate Description"
                      generatingLabel="Generating description..."
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
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium text-[var(--text-muted)]">
                  Commits
                </span>
                <span className="rounded-full bg-[var(--bg-active)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                  {commits.length}
                </span>
              </div>
              <div className="max-h-[200px] min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                {loading && (
                  <div className="py-5 text-center text-xs text-[var(--text-muted)]">
                    Loading...
                  </div>
                )}
                {!loading && commits.length === 0 && (
                  <div className="py-5 text-center text-xs text-[var(--text-muted)]">
                    No commits ahead of {base || "base"}
                  </div>
                )}
                {!loading &&
                  commits.map((c) => (
                    <div
                      key={c.hash}
                      className="flex items-center gap-2 px-2.5 py-[5px] transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <span className="shrink-0 font-mono text-[11px] text-[var(--accent-blue-text)]">
                        {c.hash}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-primary)]">
                        {c.subject}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--text-muted)]">
                        {c.date}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-[var(--border)] px-5 py-3">
        {!prURL && createDisabledReason && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--accent-amber)]/30 bg-[var(--accent-amber)]/10 px-3 py-2 text-[12px] font-medium leading-snug text-[var(--accent-amber-text)]">
            <AlertCircle size={15} className="shrink-0 text-[var(--accent-amber)]" />
            <span>{createDisabledReason}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
            {canCreate && !prURL && (
              <kbd className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                &#8984;&#9166;
              </kbd>
            )}
            {ai.anyAvailable && !prURL && (
              <Tooltip
                content="Auto-generate PR description on open"
                side="top"
                align="start"
              >
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={autoGenerate}
                    onChange={toggleAutoGenerate}
                    className="h-3 w-3 accent-[var(--accent-blue)]"
                  />
                  Auto-generate
                </label>
              </Tooltip>
            )}
            {!prURL && (
              <InstructionsChip projectName={projectName} target="pr" backTitle="Back to pull request" />
            )}
          </span>
          <div className="flex gap-2">
            <button
              onClick={closeModal}
              disabled={busy}
              className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              {prURL ? "Close" : "Cancel"}
            </button>
            {!prURL && (
              <CreatePRSplitButton
                draft={draft}
                busy={busy}
                disabled={!canCreate}
                onCreate={submit}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
