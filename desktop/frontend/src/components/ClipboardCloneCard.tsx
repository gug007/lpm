import { useAppStore } from "../store/app";
import { getSettings } from "../store/settings";
import { shortPath } from "../toolkit";
import { useCloneOffer } from "../clone/cloneOffer";
import { useClipboardRemote } from "../clone/useClipboardRemote";
import { CloudBranchIcon } from "./icons";

// "Clone github.com/acme/storefront?" when the clipboard holds a Git remote:
// Clone… opens the clone dialog filled in, Not now hides it for that URL.
export function ClipboardCloneCard({ className = "" }: { className?: string }) {
  const remote = useClipboardRemote();
  const pick = useAppStore((s) => s.pickAddProjectKind);
  const target = useAppStore((s) => s.addProjectTarget);
  const dismiss = useCloneOffer((s) => s.dismiss);
  const prefill = useCloneOffer((s) => s.prefill);
  if (!remote) return null;

  const defaultDir = getSettings().defaultProjectDirectory;
  const where = target ? `on ${target.alias}` : defaultDir ? `into ${shortPath(defaultDir)}` : "";

  const clone = () => {
    prefill(remote.url);
    void pick("clone");
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3.5 py-3 text-left ${className}`}
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[#a78bfa]">
        <CloudBranchIcon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[var(--text-primary)]" title={remote.url}>
          Clone {remote.label}?
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
          From your clipboard{where && ` · ${where}`}
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={clone}
            className="rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-[12px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
          >
            Clone…
          </button>
          <button
            type="button"
            onClick={() => dismiss(remote.url)}
            className="rounded-md px-2 py-1 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
