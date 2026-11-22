import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "../notifications/toast";
import { CheckoutBranch, PullBranch, SetClipboardText } from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { getSettings } from "../store/settings";
import { prFromCreatedUrl } from "../store/branchPr";
import { DEFAULT_PULL_CONFIG, pullFlags } from "../gitOptions";
import { pullErrorText } from "../gitPullErrors";
import { useConfirmFlash } from "../hooks/useConfirmFlash";
import { BranchIcon, CopyIcon } from "./icons";
import { forgeWords, type ForgeWords } from "../gitForge";

interface PRCreatedViewProps {
  projectPath: string;
  branch: string;
  base: string;
  url: string;
  draft?: boolean;
  words?: ForgeWords;
  onSwitched: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function PRCreatedView({
  projectPath,
  branch,
  base,
  url,
  draft = false,
  words = forgeWords(),
  onSwitched,
  onBusyChange,
}: PRCreatedViewProps) {
  const [switching, setSwitching] = useState(false);
  const [copied, flashCopied] = useConfirmFlash();
  const pr = prFromCreatedUrl(url, "");
  const link = url.trim();

  const copyLink = async () => {
    try {
      await SetClipboardText(link);
      flashCopied();
    } catch (err) {
      toast.error(`Copy failed: ${err}`);
    }
  };

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
      toast.error(pullErrorText(err, `Switched to ${base}, but pull failed`));
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
        <span className="flex items-center gap-2 text-base font-medium text-[var(--text-primary)]">
          {pr ? `${words.sentence} ${words.ref(pr.number)} created` : `${words.sentence} created`}
          {draft && (
            <span className="rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              Draft
            </span>
          )}
        </span>
        <span className="text-xs text-[var(--text-muted)]">
          {branch} &rarr; {base}
        </span>
      </div>
      {link && (
        <div className="flex w-full max-w-[460px] items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-secondary)]" title={link}>
            {link}
          </span>
          <button
            type="button"
            onClick={copyLink}
            aria-label={copied ? "Copied" : "Copy link"}
            title={copied ? "Copied" : "Copy link"}
            className={`shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--bg-hover)] ${
              copied ? "text-[var(--accent-green)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {copied ? <Check size={13} /> : <CopyIcon size={13} />}
          </button>
        </div>
      )}
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
          Open on {words.site}
        </button>
      </div>
    </div>
  );
}
