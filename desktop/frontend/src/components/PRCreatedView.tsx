import { useState } from "react";
import { toast } from "sonner";
import { CheckoutBranch, PullBranch } from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { getSettings } from "../store/settings";
import { DEFAULT_PULL_CONFIG, pullFlags } from "../gitOptions";
import { BranchIcon } from "./icons";

interface PRCreatedViewProps {
  projectPath: string;
  branch: string;
  base: string;
  url: string;
  onSwitched: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function PRCreatedView({
  projectPath,
  branch,
  base,
  url,
  onSwitched,
  onBusyChange,
}: PRCreatedViewProps) {
  const [switching, setSwitching] = useState(false);

  const switchToBase = async () => {
    if (switching || !base) return;
    setSwitching(true);
    onBusyChange?.(true);
    try {
      await CheckoutBranch(projectPath, base, "");
    } catch (err) {
      toast.error(`Switch to ${base}: ${err}`);
      setSwitching(false);
      onBusyChange?.(false);
      return;
    }
    try {
      const cfg = getSettings().gitPull ?? DEFAULT_PULL_CONFIG;
      await PullBranch(projectPath, cfg.strategy, pullFlags(cfg));
      toast.success(`Switched to ${base} and pulled the latest changes`);
    } catch (err) {
      toast.error(`Switched to ${base}, but pull failed: ${err}`);
    } finally {
      setSwitching(false);
      onBusyChange?.(false);
    }
    onSwitched();
  };

  return (
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
        <span className="text-base font-medium text-[var(--text-primary)]">
          Pull request created
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {branch} &rarr; {base}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={switchToBase}
          disabled={switching}
          title={`Check out ${base} and pull the latest changes`}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <BranchIcon size={12} />
          {switching ? `Switching to ${base}…` : `Switch to ${base} and pull`}
        </button>
        <button
          onClick={() => BrowserOpenURL(url)}
          disabled={switching}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-50"
        >
          Open on GitHub
        </button>
      </div>
    </div>
  );
}
