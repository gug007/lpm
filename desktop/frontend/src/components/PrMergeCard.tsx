import { useArmedMerge } from "../hooks/useArmedMerge";
import { usePrMergeOffer } from "../hooks/usePrMergeOffer";
import { prLook } from "../prLook";
import { prWords } from "../gitForge";
import type { PullRequestInfo } from "../types";
import { PrMergeBody } from "./PrMergeBody";
import { PrMergeFixItems } from "./PrMergeFixItems";
import { PrMergeLine } from "./PrMergeLine";
import { PrOpenOnGitHub } from "./PrOpenOnGitHub";

interface PrMergeCardProps {
  pr: PullRequestInfo;
  branch: string;
  projectName: string;
  projectPath: string;
  onClose: () => void;
}

/** The footer PR pill's card: how the pull request stands on checks, review
 *  and conflicts, and merging it once GitHub says it can go, with the
 *  repository's methods and its branch deleted on GitHub, as on the phone. */
export function PrMergeCard({ pr, branch, projectName, projectPath, onClose }: PrMergeCardProps) {
  const offer = usePrMergeOffer(projectPath, branch);
  const watch = useArmedMerge(projectPath);
  const info = offer.kind === "loaded" ? offer.info : null;
  const shown = info ?? pr;
  const look = prLook(shown);
  const words = prWords(pr);
  const base = info?.merge.base;

  return (
    <div className="w-[300px]">
      <div className="px-3 pb-2.5 pt-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <look.Icon size={13} className="shrink-0" style={{ color: look.color }} />
          <span className="truncate text-[12px] font-medium text-[var(--text-primary)]" title={shown.title}>
            <span className="tabular-nums">{words.ref(pr.number)}</span> {shown.title}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--text-muted)]">
          {base ? `${branch} → ${base}` : branch}
        </div>
        {offer.kind === "loading" && (
          <PrMergeLine state="pending" className="mt-2.5">
            Asking {words.site}
          </PrMergeLine>
        )}
        {offer.kind === "missing" && (
          <p className="mt-2.5 text-[11px] leading-snug text-[var(--text-secondary)]">
            {words.site} didn't say how this {words.noun} stands. It may have merged or closed.
          </p>
        )}
        {info ? (
          <PrMergeBody
            key={info.number}
            info={info}
            armed={watch?.number === info.number ? watch : undefined}
            projectPath={projectPath}
            onClose={onClose}
          />
        ) : (
          <div className="mt-3 flex justify-end">
            <PrOpenOnGitHub url={pr.url} onClose={onClose} site={words.site} />
          </div>
        )}
      </div>
      {info && <PrMergeFixItems info={info} projectName={projectName} onClose={onClose} />}
    </div>
  );
}
