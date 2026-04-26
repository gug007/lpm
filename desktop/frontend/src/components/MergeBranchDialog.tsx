import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/Modal";
import {
  CheckAICLIs,
  GitAbortMerge,
  GitCommitCount,
  GitDefaultBranch,
  GitFetchAll,
  GitMerge,
  GitMergeConflicts,
  ResolveMergeConflictsWithAI,
} from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { main } from "../../wailsjs/go/models";
import { useBranchSearch } from "../hooks/useBranchSearch";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { branchKey, branchMatches, RemoteBadge } from "./branchUtils";
import { BranchIcon, ChevronDownIcon, CloudBranchIcon, XIcon } from "./icons";
import { relativeTime } from "../relativeTime";
import { AIPickerButton } from "./ui/AIPickerButton";
import { AI_CLI_OPTIONS, aiDefaultModel, aiPickLabel, resolveAIPick, type AICLI } from "../types";
import { getSettings, saveSettings } from "../settings";

const MERGE_CONFLICT_PROGRESS_EVENT = "merge-conflict-progress";
const FETCH_DEBOUNCE_MS = 30_000;
const FETCH_MAP_CAP = 50;
const lastFetchAt: Map<string, number> = new Map();

function recordFetch(path: string) {
  lastFetchAt.set(path, Date.now());
  if (lastFetchAt.size > FETCH_MAP_CAP) {
    const oldest = lastFetchAt.keys().next().value;
    if (oldest !== undefined) lastFetchAt.delete(oldest);
  }
}

interface MergeBranchDialogProps {
  open: boolean;
  projectPath: string;
  currentBranch: string;
  branches: main.Branch[];
  onClose: () => void;
  onMerged: () => void;
}

type Mode =
  | { kind: "picking" }
  | { kind: "conflicts"; files: string[] };

export function MergeBranchDialog({
  open,
  projectPath,
  currentBranch,
  branches,
  onClose,
  onMerged,
}: MergeBranchDialogProps) {
  const [mode, setMode] = useState<Mode>({ kind: "picking" });
  const [source, setSource] = useState<main.Branch | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [progressLine, setProgressLine] = useState("");
  const [commitCount, setCommitCount] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchTick, setFetchTick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const initRef = useRef(false);

  const [aiCLIs, setAiCLIs] = useState<Record<string, boolean>>({});
  const [selectedCLI, setSelectedCLI] = useState<AICLI>(
    () => (getSettings().aiCli as AICLI) || "claude",
  );
  const [selectedModel, setSelectedModel] = useState<string>(
    () => getSettings().aiModel ?? aiDefaultModel("claude"),
  );

  const excludeCurrent = useMemo(
    () => (b: main.Branch) => b.name !== currentBranch || !!b.remote,
    [currentBranch],
  );

  const searchResults = useBranchSearch(projectPath, query, pickerOpen, excludeCurrent);

  const pickerRef = useOutsideClick<HTMLDivElement>(
    () => setPickerOpen(false),
    pickerOpen,
  );

  useEffect(() => {
    if (!open) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;

    setMode({ kind: "picking" });
    setPickerOpen(false);
    setQuery("");
    setBusy(false);
    setAiBusy(false);
    setProgressLine("");
    setCommitCount(null);

    const otherBranches = branches.filter(
      (b) => b.name !== currentBranch || !!b.remote,
    );
    setSource(otherBranches[0] ?? null);

    let cancelled = false;
    const lastFetch = lastFetchAt.get(projectPath) ?? 0;
    if (Date.now() - lastFetch > FETCH_DEBOUNCE_MS) {
      setFetching(true);
      GitFetchAll(projectPath)
        .then(() => {
          if (cancelled) return;
          recordFetch(projectPath);
          onMerged();
          setFetchTick((t) => t + 1);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setFetching(false); });
    }
    GitMergeConflicts(projectPath)
      .then((files) => {
        if (cancelled || !files || files.length === 0) return;
        setMode({ kind: "conflicts", files });
      })
      .catch(() => {});
    GitDefaultBranch(projectPath)
      .then((name) => {
        if (cancelled || !name || name === currentBranch) return;
        const match =
          otherBranches.find((b) => b.name === name && !b.remote) ??
          otherBranches.find((b) => b.name === name);
        if (match) setSource(match);
      })
      .catch(() => {});
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
    // initRef short-circuits re-runs; branches is read once for the initial
    // source pick and shouldn't reset state when the parent refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectPath]);

  useEffect(() => {
    if (pickerOpen) setTimeout(() => searchRef.current?.focus(), 30);
  }, [pickerOpen]);

  useEffect(() => {
    if (!open || mode.kind !== "picking" || !source) {
      setCommitCount(null);
      return;
    }
    let cancelled = false;
    GitCommitCount(projectPath, "HEAD", branchKey(source))
      .then((n) => { if (!cancelled) setCommitCount(n); })
      .catch(() => { if (!cancelled) setCommitCount(null); });
    return () => { cancelled = true; };
  }, [open, mode.kind, source, projectPath, fetchTick]);

  useEffect(() => {
    if (!aiBusy) return;
    const cancel = EventsOn(MERGE_CONFLICT_PROGRESS_EVENT, (msg: string) => {
      setProgressLine(msg);
    });
    return () => {
      if (typeof cancel === "function") cancel();
    };
  }, [aiBusy]);

  const filtered = useMemo(() => {
    const base = !query
      ? branches.filter(excludeCurrent)
      : searchResults !== null
        ? searchResults
        : branches.filter((b) => excludeCurrent(b) && branchMatches(b, query));
    const rank = (b: main.Branch) => (b.remote ? 1 : 0);
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [branches, query, searchResults, excludeCurrent]);

  const anyAiAvailable = AI_CLI_OPTIONS.some((o) => aiCLIs[o.value]);
  const selectedCLILabel = aiPickLabel(selectedCLI, selectedModel);

  const selectAI = (cli: AICLI, model: string) => {
    setSelectedCLI(cli);
    setSelectedModel(model);
    saveSettings({ aiCli: cli, aiModel: model });
  };

  const merge = async () => {
    if (busy || !source) return;
    setBusy(true);
    try {
      await GitMerge(projectPath, branchKey(source));
      toast.success(`Merged ${source.name} into ${currentBranch}`);
      onMerged();
      onClose();
    } catch (err) {
      const conflicts = await GitMergeConflicts(projectPath).catch(() => [] as string[]);
      onMerged();
      if (conflicts.length > 0) {
        setMode({ kind: "conflicts", files: conflicts });
      } else {
        toast.error(`Merge failed: ${err}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const resolveWithAI = async () => {
    if (aiBusy || mode.kind !== "conflicts") return;
    setAiBusy(true);
    setProgressLine("");
    try {
      await ResolveMergeConflictsWithAI(projectPath, selectedCLI, selectedModel);
      const remaining = await GitMergeConflicts(projectPath).catch(() => [] as string[]);
      onMerged();
      if (remaining.length === 0) {
        toast.success("Conflicts resolved — review and commit");
        onClose();
      } else {
        setMode({ ...mode, files: remaining });
        toast.warning(`${remaining.length} file(s) still have conflicts`);
      }
    } catch (err) {
      toast.error(`AI resolve failed: ${err}`);
    } finally {
      setAiBusy(false);
      setProgressLine("");
    }
  };

  const abort = async () => {
    if (aiBusy) return;
    try {
      await GitAbortMerge(projectPath);
      toast.success("Merge aborted");
      onMerged();
      onClose();
    } catch (err) {
      toast.error(`Abort failed: ${err}`);
    }
  };

  const interactive = !busy && !aiBusy;
  const canMerge = !!source && !busy && excludeCurrent(source);

  const commitCountLabel = (() => {
    if (!source) return "";
    if (commitCount === null) return "Checking…";
    if (commitCount === 0) return "Up to date — nothing to merge";
    return `${commitCount} commit${commitCount === 1 ? "" : "s"} will be merged`;
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={interactive}
      closeOnEscape={interactive}
      zIndexClassName="z-[60]"
      contentClassName="w-[480px] overflow-visible rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          {mode.kind === "conflicts" ? "Merge conflicts" : "Merge"}
        </h3>
        {mode.kind === "conflicts" && (
          <span className="ml-3 flex-1 truncate text-[11px] text-[var(--text-muted)]">
            {mode.files.length} file{mode.files.length === 1 ? "" : "s"} need resolving in{" "}
            <span className="font-mono text-[var(--text-secondary)]">{currentBranch}</span>
          </span>
        )}
        <button
          onClick={onClose}
          disabled={!interactive}
          aria-label="Close"
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      {mode.kind === "picking" ? (
        <>
          <div
            className="px-4 py-4"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pickerOpen && canMerge) {
                e.preventDefault();
                merge();
              }
            }}
          >
            <div className="flex items-center gap-2.5">
              <div ref={pickerRef} className="relative min-w-0 flex-1">
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-left text-[13px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
                >
                  {source?.remote ? <CloudBranchIcon size={14} /> : <BranchIcon size={14} />}
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate font-mono">
                      {source ? source.name : "No branches"}
                    </span>
                    {source?.remote && <RemoteBadge remote={source.remote} />}
                  </span>
                  <span className="text-[var(--text-muted)]"><ChevronDownIcon /></span>
                </button>
                {pickerOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
                  <div className="border-b border-[var(--border)] p-2">
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search branches"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                  </div>
                  <div className="max-h-[280px] overflow-y-auto py-1">
                    {filtered.length === 0 && (
                      <div className="px-3 py-2 text-[12px] text-[var(--text-muted)]">
                        {query ? "No matches" : "No other branches"}
                      </div>
                    )}
                    {filtered.map((b) => {
                      const key = branchKey(b);
                      const age = relativeTime(b.committerDate);
                      const isSelected = source && branchKey(source) === key;
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            setSource(b);
                            setPickerOpen(false);
                            setQuery("");
                          }}
                          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-[var(--bg-hover)] ${
                            isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {b.remote ? <CloudBranchIcon size={13} /> : <BranchIcon size={13} />}
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="truncate font-mono">{b.name}</span>
                            {b.remote && <RemoteBadge remote={b.remote} />}
                          </span>
                          {age && <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{age}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
              <span className="text-[var(--text-muted)]">→</span>
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                <BranchIcon size={14} />
                <span className="truncate font-mono">{currentBranch || "current branch"}</span>
              </span>
            </div>
            <p className="mt-2 flex min-h-[16px] items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <span>{commitCountLabel}</span>
              {fetching && (
                <span className="ml-auto inline-flex items-center gap-1 text-[var(--text-muted)]">
                  <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-[var(--text-muted)]" />
                  Fetching latest…
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={merge}
              disabled={!canMerge}
              className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
            >
              {busy ? "Merging…" : "Merge"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="max-h-[260px] overflow-y-auto px-4 py-3">
            <ul className="flex flex-col gap-1 font-mono text-[12px] text-[var(--text-secondary)]">
              {mode.files.map((f) => (
                <li key={f} className="truncate" title={f}>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          {aiBusy && progressLine && (
            <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
              <span className="line-clamp-2">{progressLine}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
            <button
              onClick={abort}
              disabled={!interactive}
              className="text-[12px] text-[var(--accent-red)] transition-colors hover:underline disabled:opacity-40"
            >
              Abort merge
            </button>
            <div className="flex items-center gap-2">
              {anyAiAvailable ? (
                <AIPickerButton
                  onGenerate={resolveWithAI}
                  generating={aiBusy}
                  disabled={aiBusy || busy}
                  title={`Resolve with ${selectedCLILabel}`}
                  label="Resolve with AI"
                  generatingLabel="Resolving…"
                  aiCLIs={aiCLIs}
                  selectedCLI={selectedCLI}
                  selectedModel={selectedModel}
                  onSelect={selectAI}
                />
              ) : (
                <span className="text-[11px] text-[var(--text-muted)]">
                  Install Claude Code, Codex, Gemini, or OpenCode to resolve with AI
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
