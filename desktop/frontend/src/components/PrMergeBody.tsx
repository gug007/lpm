import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, LoaderCircle } from "lucide-react";
import { MergePullRequest, MergePullRequestWhenReady } from "../../bridge/commands";
import { toast } from "../notifications/toast";
import { checksLabel, checksSummary } from "../prChecks";
import {
  MERGE_METHOD_LABEL,
  allowedMethods,
  baseName,
  conflictLine,
  mergeMode,
  mergeStatus,
  pickMethod,
  reviewLine,
  saveMergeMethod,
  savedMergeMethod,
  type MergeMode,
} from "../prMerge";
import { afterMerge } from "../prMergeDone";
import { prWords } from "../gitForge";
import { usePrMergeWatch } from "../store/prMergeWatch";
import type { PrMergeMethod, PrMergeWatch, PullRequestMergeInfo } from "../types";
import { PrMergeArmed } from "./PrMergeArmed";
import { PrMergeLine } from "./PrMergeLine";
import { PrMergeMenu } from "./PrMergeMenu";
import { PrOpenOnGitHub } from "./PrOpenOnGitHub";

const MERGE_BUTTON =
  "flex shrink-0 items-center gap-1.5 whitespace-nowrap py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40";
const NOTE = "rounded-md px-2 py-1.5 text-[11px] leading-snug";

/** The PR card once GitHub has answered: checks, review and conflicts, then
 *  the merge button, which waits for running checks, merges, or bypasses the
 *  rules for someone GitHub allows to; or, while lpm waits, what it will do. */
export function PrMergeBody({
  info,
  armed,
  projectPath,
  onClose,
}: {
  info: PullRequestMergeInfo;
  armed: PrMergeWatch | undefined;
  projectPath: string;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PrMergeMethod>(() => pickMethod(info.merge.methods, savedMergeMethod()));
  const [picked, setPicked] = useState<MergeMode | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const words = prWords(info);
  const methods = allowedMethods(info.merge.methods);
  const status = mergeStatus(info);
  const mode = mergeMode(status, picked);
  const summary = checksSummary(info);
  const review = reviewLine(info.merge.review);
  const conflict = conflictLine(info);
  const base = baseName(info);
  const hasMenu = methods.length > 1 || (status.wait && status.now) || status.bypass;

  const fail = (err: unknown) => {
    const message = String(err).trim() || `${words.site} didn't merge it.`;
    if (!mounted.current) {
      toast.error(`Couldn't merge ${words.ref(info.number)}`, { description: message });
      return;
    }
    setBusy(false);
    setError(message);
  };

  const run = () => {
    if (!mode) return;
    setBusy(true);
    setError(null);
    setChoosing(false);
    const deletes = info.merge.deletesBranch || deleteBranch;
    if (mode === "wait") {
      MergePullRequestWhenReady(projectPath, info.number, info.title, method, deletes, status.bypass)
        .then(() => {
          usePrMergeWatch.getState().apply({
            path: projectPath,
            number: info.number,
            title: info.title,
            method,
            deleteBranch: deletes,
            bypass: status.bypass,
            state: "waiting",
            deletedBranch: false,
          });
          if (mounted.current) setBusy(false);
        })
        .catch(fail);
      return;
    }
    MergePullRequest(projectPath, info.number, method, info.merge.head, deletes, mode === "bypass")
      .then((deleted) => {
        onClose();
        void afterMerge(projectPath, info.number, deleted);
      })
      .catch(fail);
  };

  const chooseMethod = (next: PrMergeMethod) => {
    setMethod(next);
    saveMergeMethod(next);
    setChoosing(false);
  };

  const chooseMode = (next: MergeMode | null) => {
    setPicked(next);
    setChoosing(false);
  };

  const lines = (
    <div className="mt-2.5 flex flex-col gap-1.5">
      {summary ? (
        <PrMergeLine state={summary.verdict}>
          {summary.verdict === "pass" ? "All checks passed" : checksLabel(summary)}
        </PrMergeLine>
      ) : (
        <PrMergeLine state="skipped">No checks</PrMergeLine>
      )}
      {review && <PrMergeLine state={review.tone}>{review.text}</PrMergeLine>}
      <PrMergeLine state={conflict.tone}>{conflict.text}</PrMergeLine>
    </div>
  );

  if (armed) {
    return (
      <>
        {lines}
        <PrMergeArmed
          watch={armed}
          base={base}
          url={info.url}
          site={words.site}
          projectPath={projectPath}
          onClose={onClose}
        />
      </>
    );
  }

  const tone = mode === "bypass" ? "bg-[var(--accent-red)]" : "bg-[var(--accent-green)]";
  const label =
    mode === "wait" ? "Merge when checks pass" : mode === "bypass" ? "Bypass rules and merge" : MERGE_METHOD_LABEL[method];

  return (
    <>
      {lines}
      {status.kind === "blocked" && status.note && (
        <p className={`mt-2.5 ${NOTE} bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] text-[var(--text-secondary)]`}>
          {status.note}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className={`mt-2.5 ${NOTE} line-clamp-4 whitespace-pre-wrap break-words bg-[color-mix(in_srgb,var(--accent-red)_10%,transparent)] text-[var(--accent-red)]`}
        >
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex">
          <button
            type="button"
            onClick={run}
            disabled={!mode || busy}
            className={`${MERGE_BUTTON} ${tone} px-3 ${hasMenu ? "rounded-l-md" : "rounded-md"}`}
          >
            {busy ? (
              <LoaderCircle size={12} className="animate-spin" />
            ) : (
              mode === "wait" && <Clock size={12} />
            )}
            {busy && mode !== "wait" ? "Merging" : label}
          </button>
          {hasMenu && (
            <button
              type="button"
              onClick={() => setChoosing((v) => !v)}
              disabled={busy || (!mode && !status.bypass)}
              aria-label="When and how to merge"
              aria-expanded={choosing}
              title="When and how to merge"
              className={`${MERGE_BUTTON} ${tone} rounded-r-md border-l border-white/30 px-1.5`}
            >
              <ChevronDown size={12} />
            </button>
          )}
        </div>
        <span className="ml-auto">
          <PrOpenOnGitHub url={info.url} onClose={onClose} site={words.site} />
        </span>
      </div>
      {choosing && (
        <PrMergeMenu
          status={status}
          mode={mode}
          method={method}
          methods={methods}
          running={summary?.pending ?? 0}
          base={base}
          onMode={chooseMode}
          onMethod={chooseMethod}
        />
      )}
      {info.merge.deletesBranch ? (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">{words.site} deletes the branch once it's merged.</p>
      ) : (
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={deleteBranch}
            onChange={(e) => setDeleteBranch(e.target.checked)}
            disabled={busy}
            className="h-3 w-3 accent-[var(--accent-blue)]"
          />
          Delete the branch on {words.site}
        </label>
      )}
    </>
  );
}
