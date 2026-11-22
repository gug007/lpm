import { useState } from "react";
import { Clock } from "lucide-react";
import { CancelPullRequestMerge } from "../../bridge/commands";
import { armedText } from "../prMerge";
import { usePrMergeWatch } from "../store/prMergeWatch";
import type { PrMergeWatch } from "../types";
import { PrOpenOnGitHub } from "./PrOpenOnGitHub";
import { BTN_SECONDARY_SM } from "./ui/buttons";

/** The PR card while lpm waits to merge once the checks pass: what it will do,
 *  and a way to stop it. */
export function PrMergeArmed({
  watch,
  base,
  url,
  site = "GitHub",
  projectPath,
  onClose,
}: {
  watch: PrMergeWatch;
  base: string;
  url: string;
  site?: string;
  projectPath: string;
  onClose: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    setCancelling(true);
    setError(null);
    CancelPullRequestMerge(projectPath)
      .then(() => usePrMergeWatch.getState().forget(projectPath))
      .catch((err: unknown) => {
        setCancelling(false);
        setError(String(err).trim() || "lpm couldn't stop waiting.");
      });
  };

  return (
    <>
      <div
        role="status"
        className="mt-2.5 rounded-md bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] px-2 py-1.5"
      >
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--text-primary)]">
          <Clock size={12} style={{ color: "var(--accent-amber)" }} />
          Merging when checks pass
        </div>
        <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--text-secondary)]">{armedText(watch, base, site)}</p>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[11px] leading-snug text-[var(--accent-red)]">
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={cancel} disabled={cancelling} className={BTN_SECONDARY_SM}>
          Cancel
        </button>
        <span className="ml-auto">
          <PrOpenOnGitHub url={url} onClose={onClose} site={site} />
        </span>
      </div>
    </>
  );
}
