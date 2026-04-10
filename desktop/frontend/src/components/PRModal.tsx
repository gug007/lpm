import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import { XIcon, ChevronDownIcon, BranchIcon, CloudBranchIcon, CheckIcon } from "./icons";
import { branchKey, branchMatches, RemoteBadge } from "./branchUtils";
import { AIButton } from "./ui/AIButton";
import {
  CheckAICLIs,
  CheckGHCLI,
  CreatePullRequest,
  GeneratePRTitle,
  GeneratePRDescription,
  GitDefaultBranch,
  GitLogBranch,
  ListBranches,
} from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { AI_CLI_OPTIONS } from "../types";
import { EventsEmit, BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { getSettings, saveSettings } from "../settings";
import { Tooltip } from "./ui/Tooltip";

type BranchCommit = main.BranchCommit;
type Branch = main.Branch;

const DESC_MAX_HEIGHT = { maxHeight: "calc(8 * 1.5em + 1rem)" };

interface PRModalProps {
  open: boolean;
  projectPath: string;
  currentBranch: string;
  onClose: () => void;
  onCreated: () => void;
}

export function PRModal({
  open,
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
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [ghAvailable, setGhAvailable] = useState(true);
  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState("claude");
  const [cliMenuOpen, setCLIMenuOpen] = useState(false);
  const [baseMenuOpen, setBaseMenuOpen] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [baseQuery, setBaseQuery] = useState("");
  const excludeCurrent = useCallback(
    (b: Branch) => b.name !== currentBranch,
    [currentBranch],
  );
  const baseSearchResults = useBranchSearch(projectPath, baseQuery, baseMenuOpen, excludeCurrent);
  const [autoGenerate, setAutoGenerate] = useState(
    () => getSettings().autoGeneratePRDescription ?? false,
  );
  const [prURL, setPrURL] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const cliRef = useOutsideClick<HTMLDivElement>(
    () => setCLIMenuOpen(false),
    cliMenuOpen,
  );
  const baseSearchRef = useRef<HTMLInputElement>(null);
  const baseRef = useOutsideClick<HTMLDivElement>(
    () => { setBaseMenuOpen(false); setBaseQuery(""); },
    baseMenuOpen,
  );

  useEffect(() => {
    if (baseMenuOpen) baseSearchRef.current?.focus();
  }, [baseMenuOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTitle("");
    setDescription("");
    setBase("");
    setCommits([]);
    setBranches([]);
    setPrURL("");
    setLoading(true);

    (async () => {
      try {
        const [defaultBranch, ghOk, cliAvail, branchList] = await Promise.all([
          GitDefaultBranch(projectPath),
          CheckGHCLI(),
          CheckAICLIs().catch(() => null),
          ListBranches(projectPath).catch(() => [] as Branch[]),
        ]);
        if (cancelled) return;
        setBase(defaultBranch);
        setGhAvailable(ghOk);
        setBranches(branchList.filter((b) => b.name !== currentBranch));
        if (cliAvail) {
          const avail: Record<string, boolean> = {
            claude: cliAvail.claude,
            codex: cliAvail.codex,
            gemini: cliAvail.gemini,
            opencode: cliAvail.opencode,
          };
          setAiCLIs(avail);
          const first = AI_CLI_OPTIONS.find((o) => avail[o.value]);
          if (first) setSelectedCLI(first.value);
        }

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
  }, [open, projectPath, currentBranch]);

  const anyAiAvailable = AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]);
  const autoGenTriggered = useRef(false);

  const generating = generatingTitle || generatingDesc;

  useEffect(() => {
    if (!open) {
      autoGenTriggered.current = false;
      return;
    }
    if (autoGenTriggered.current || !autoGenerate) return;
    if (loading || commits.length === 0 || !base) return;
    if (!anyAiAvailable) return;
    autoGenTriggered.current = true;
    generateTitle();
    generateDesc();
  }, [open, loading, commits, base, anyAiAvailable, autoGenerate]);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [description]);

  const filteredBranches = useMemo(() => {
    if (!baseQuery) return branches;
    if (baseSearchResults !== null) return baseSearchResults;
    // Fallback during the debounce window: filter the cached recent list.
    return branches.filter((b) => branchMatches(b, baseQuery));
  }, [branches, baseQuery, baseSearchResults]);

  const changeBase = async (newBase: string) => {
    setBase(newBase);
    setBaseMenuOpen(false);
    setBaseQuery("");
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
    setGeneratingTitle(true);
    try {
      const result = await GeneratePRTitle(projectPath, selectedCLI, base);
      if (result) setTitle(result);
    } catch (err) {
      toast.error(`Title generation failed: ${err}`);
    } finally {
      setGeneratingTitle(false);
    }
  };

  const generateDesc = async () => {
    if (generatingDesc || !base) return;
    setGeneratingDesc(true);
    try {
      const result = await GeneratePRDescription(projectPath, selectedCLI, base);
      if (result) setDescription(result);
    } catch (err) {
      toast.error(`Description generation failed: ${err}`);
    } finally {
      setGeneratingDesc(false);
    }
  };

  const toggleAutoGenerate = () => {
    const next = !autoGenerate;
    setAutoGenerate(next);
    saveSettings({ autoGeneratePRDescription: next });
  };

  const selectedCLILabel =
    AI_CLI_OPTIONS.find((o) => o.value === selectedCLI)?.label ?? selectedCLI;

  const canCreate =
    !busy && !loading && !generating && title.trim().length > 0 && ghAvailable && commits.length > 0;

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const url = await CreatePullRequest(
        projectPath,
        title.trim(),
        description.trim(),
        base,
      );
      setPrURL(url);
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
      onClose={onClose}
      closeOnBackdrop={!busy && !generating}
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[640px] max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Create Pull Request
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

        {!ghAvailable && (
          <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-3 py-2 text-[11px] text-[var(--accent-red)]">
            GitHub CLI (gh) not found. Install it from{" "}
            <span className="font-medium">https://cli.github.com</span> and run{" "}
            <code className="rounded bg-[var(--bg-hover)] px-1">gh auth login</code>
          </div>
        )}

        {prURL ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-green)]/10">
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent-green)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pr-check-animate"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium text-[var(--text-primary)]">
                Pull request created
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {currentBranch} &rarr; {base}
              </span>
            </div>
            <button
              onClick={() => BrowserOpenURL(prURL)}
              className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90"
            >
              Open on GitHub
            </button>
          </div>
        ) : (
          <>
            {/* Base branch */}
            <div className="flex items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
                <BranchIcon size={10} /> {currentBranch}
              </span>
              <span className="text-[var(--text-muted)]">&rarr;</span>
              <div ref={baseRef} className="relative">
                <button
                  onClick={() => setBaseMenuOpen(!baseMenuOpen)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <BranchIcon size={10} /> {base || "..."}
                  <ChevronDownIcon />
                </button>
                {baseMenuOpen && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-96 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg">
                    <div className="border-b border-[var(--border)] p-2">
                      <input
                        ref={baseSearchRef}
                        value={baseQuery}
                        onChange={(e) => setBaseQuery(e.target.value)}
                        placeholder="Search branches"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="w-full rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto py-1">
                      {filteredBranches.map((b) => {
                        const selected = b.name === base;
                        return (
                          <button
                            key={branchKey(b)}
                            onClick={() => changeBase(b.name)}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
                              selected
                                ? "font-medium text-[var(--text-primary)]"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {b.remote ? <CloudBranchIcon size={10} /> : <BranchIcon size={10} />}
                            <span className="min-w-0 flex-1 truncate">{b.name}</span>
                            {b.remote && <RemoteBadge remote={b.remote} />}
                            {selected && <CheckIcon />}
                          </button>
                        );
                      })}
                      {filteredBranches.length === 0 && (
                        <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]">No matches</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Title
                </span>
                {anyAiAvailable && (
                  <div ref={cliRef} className="relative">
                    <AIButton
                      onClick={generateTitle}
                      disabled={generatingTitle || busy || !base}
                      loading={generatingTitle}
                      title={`Generate with ${selectedCLILabel}`}
                      trailing={
                        <button
                          onClick={() => setCLIMenuOpen(!cliMenuOpen)}
                          disabled={generating || busy}
                          title="Select AI CLI"
                        >
                          <ChevronDownIcon />
                        </button>
                      }
                    >
                      {generatingTitle ? "Generating..." : "Generate With AI"}
                    </AIButton>
                    {cliMenuOpen && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
                        {AI_CLI_OPTIONS.filter((o) => aiCLIs[o.value]).map(
                          (o) => (
                            <button
                              key={o.value}
                              onClick={() => {
                                setSelectedCLI(o.value);
                                setCLIMenuOpen(false);
                              }}
                              className={`flex w-full items-center px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
                                selectedCLI === o.value
                                  ? "font-medium text-[var(--text-primary)]"
                                  : "text-[var(--text-secondary)]"
                              }`}
                            >
                              {o.label}
                              {selectedCLI === o.value && (
                                <CheckIcon />
                              )}
                            </button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div
                className={
                  generatingTitle
                    ? "relative rounded-lg p-[1.5px] [background:conic-gradient(from_var(--gradient-angle),#3b82f6,#8b5cf6,#ec4899,#06b6d4,#6366f1,#3b82f6)] animate-[gradient-spin_2s_linear_infinite]"
                    : ""
                }
              >
                <input
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="PR title..."
                  disabled={busy}
                  className={`w-full bg-[var(--bg-secondary)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                    generatingTitle
                      ? "block rounded-[calc(0.5rem-1.5px)] border-none"
                      : "rounded-lg border border-[var(--border)] focus:border-[var(--text-muted)]"
                  }`}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Description
                </span>
                {anyAiAvailable && (
                  <AIButton
                    onClick={generateDesc}
                    disabled={generatingDesc || busy || !base}
                    loading={generatingDesc}
                    title={`Generate with ${selectedCLILabel}`}
                    trailing={
                      <button
                        onClick={() => setCLIMenuOpen(!cliMenuOpen)}
                        disabled={generating || busy}
                        title="Select AI CLI"
                      >
                        <ChevronDownIcon />
                      </button>
                    }
                  >
                    {generatingDesc ? "Generating..." : "Generate With AI"}
                  </AIButton>
                )}
              </div>
              <div
                className={
                  generatingDesc
                    ? "relative rounded-lg p-[1.5px] [background:conic-gradient(from_var(--gradient-angle),#3b82f6,#8b5cf6,#ec4899,#06b6d4,#6366f1,#3b82f6)] animate-[gradient-spin_2s_linear_infinite]"
                    : ""
                }
              >
                <textarea
                  ref={descRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="Describe your changes..."
                  disabled={busy}
                  rows={3}
                  style={DESC_MAX_HEIGHT}
                  className={`w-full resize-none bg-[var(--bg-secondary)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] disabled:opacity-60 ${
                    generatingDesc
                      ? "block rounded-[calc(0.5rem-1.5px)] border-none"
                      : "rounded-lg border border-[var(--border)] focus:border-[var(--text-muted)]"
                  }`}
                />
              </div>
            </div>

            {/* Commits */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                Commits
                <span className="ml-1 text-[var(--text-muted)]/60">
                  {commits.length}
                </span>
              </span>
              <div className="max-h-[200px] min-h-0 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                {loading && (
                  <div className="py-5 text-center text-[11px] text-[var(--text-muted)]">
                    Loading...
                  </div>
                )}
                {!loading && commits.length === 0 && (
                  <div className="py-5 text-center text-[11px] text-[var(--text-muted)]">
                    No commits ahead of {base || "base"}
                  </div>
                )}
                {!loading &&
                  commits.map((c) => (
                    <div
                      key={c.hash}
                      className="flex items-center gap-2 px-2.5 py-[5px] transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <span className="shrink-0 font-mono text-[10px] text-[var(--accent-blue)]">
                        {c.hash}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-primary)]">
                        {c.subject}
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
                        {c.date}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3">
        <span className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]/60">
          {canCreate && !prURL && (
            <kbd className="rounded bg-[var(--bg-hover)] px-1 py-0.5 text-[9px] font-medium">
              &#8984;&#9166;
            </kbd>
          )}
          {anyAiAvailable && !prURL && (
            <Tooltip
              content="Auto-generate PR description on open"
              side="top"
              align="start"
            >
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
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
            <button
              onClick={() => { EventsEmit("navigate-pr-instructions"); onClose(); }}
              className="text-[10px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              Edit AI Instructions
            </button>
          )}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            {prURL ? "Close" : "Cancel"}
          </button>
          {!prURL && (
            <button
              onClick={submit}
              disabled={!canCreate}
              className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
            >
              {busy ? "Creating..." : "Create PR"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

