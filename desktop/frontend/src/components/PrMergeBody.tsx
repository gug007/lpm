import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { MergePullRequest } from "../../bridge/commands";
import { toast } from "../notifications/toast";
import { checksLabel, checksSummary } from "../prChecks";
import {
  MERGE_METHOD_LABEL,
  allowedMethods,
  conflictLine,
  mergeStatus,
  pickMethod,
  reviewLine,
  saveMergeMethod,
  savedMergeMethod,
} from "../prMerge";
import { afterMerge } from "../prMergeDone";
import type { PrMergeMethod, PullRequestMergeInfo } from "../types";
import { PrMergeLine } from "./PrMergeLine";
import { PrOpenOnGitHub } from "./PrOpenOnGitHub";
import { ContextMenuItem } from "./ui/ContextMenuItem";

const MERGE_BUTTON =
  "flex shrink-0 items-center gap-1.5 whitespace-nowrap bg-[var(--accent-green)] py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40";
const NOTE = "rounded-md px-2 py-1.5 text-[11px] leading-snug";

/** The PR card once GitHub has answered: checks, review and conflicts, then
 *  the merge button with the repository's methods. */
export function PrMergeBody({
  info,
  branch,
  projectName,
  projectPath,
  onClose,
}: {
  info: PullRequestMergeInfo;
  branch: string;
  projectName: string;
  projectPath: string;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<PrMergeMethod>(() => pickMethod(info.merge.methods, savedMergeMethod()));
  const [choosing, setChoosing] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const methods = allowedMethods(info.merge.methods);
  const status = mergeStatus(info);
  const summary = checksSummary(info);
  const review = reviewLine(info.merge.review);
  const conflict = conflictLine(info);
  const disabled = status.kind !== "ready" || merging;

  const merge = () => {
    setMerging(true);
    setError(null);
    const deletes = info.merge.deletesBranch || deleteBranch;
    MergePullRequest(projectPath, info.number, method, info.merge.head, deletes)
      .then((deleted) => {
        onClose();
        void afterMerge(projectName, projectPath, branch, info.number, deleted);
      })
      .catch((err: unknown) => {
        const message = String(err).trim() || "GitHub didn't merge it.";
        if (!mounted.current) {
          toast.error(`Couldn't merge #${info.number}`, { description: message });
          return;
        }
        setMerging(false);
        setError(message);
      });
  };

  const choose = (next: PrMergeMethod) => {
    setMethod(next);
    saveMergeMethod(next);
    setChoosing(false);
  };

  return (
    <>
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
      {status.kind === "blocked" && status.note && (
        <p className={`mt-2.5 ${NOTE} bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] text-[var(--text-secondary)]`}>
          {status.note}
        </p>
      )}
      {status.kind === "waiting" && (
        <p className="mt-2.5 text-[11px] leading-snug text-[var(--text-muted)]">
          It can merge once every check has finished.
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
            onClick={merge}
            disabled={disabled}
            className={`${MERGE_BUTTON} px-3 ${methods.length > 1 ? "rounded-l-md" : "rounded-md"}`}
          >
            {merging && <LoaderCircle size={12} className="animate-spin" />}
            {merging ? "Merging" : MERGE_METHOD_LABEL[method]}
          </button>
          {methods.length > 1 && (
            <button
              type="button"
              onClick={() => setChoosing((v) => !v)}
              disabled={disabled}
              aria-label="Merge method"
              aria-expanded={choosing}
              title="Merge method"
              className={`${MERGE_BUTTON} rounded-r-md border-l border-white/30 px-1.5`}
            >
              <ChevronDown size={12} />
            </button>
          )}
        </div>
        <span className="ml-auto">
          <PrOpenOnGitHub url={info.url} onClose={onClose} />
        </span>
      </div>
      {choosing && (
        <div role="menu" className="mt-1.5 overflow-hidden rounded-md border border-[var(--border)] py-0.5">
          {methods.map((m) => (
            <ContextMenuItem
              key={m}
              checked={m === method}
              icon={<Check size={11} className={m === method ? "" : "opacity-0"} />}
              label={MERGE_METHOD_LABEL[m]}
              onClick={() => choose(m)}
            />
          ))}
        </div>
      )}
      {info.merge.deletesBranch ? (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">GitHub deletes the branch once it's merged.</p>
      ) : (
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={deleteBranch}
            onChange={(e) => setDeleteBranch(e.target.checked)}
            disabled={merging}
            className="h-3 w-3 accent-[var(--accent-blue)]"
          />
          Delete the branch on GitHub
        </label>
      )}
    </>
  );
}
