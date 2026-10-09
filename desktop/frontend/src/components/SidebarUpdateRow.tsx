import { ArrowRight, ExternalLink, LoaderCircle, X } from "lucide-react";
import { UPDATES_INSTALL_IN_APP } from "../releasePage";
import type { UpdateInstall } from "./useUpdateInstall";

interface SidebarUpdateRowProps {
  currentVersion: string;
  latestVersion: string;
  update: UpdateInstall;
  onUpdate: () => void;
}

const ROW = "mx-2 mb-2 rounded-md px-3 py-2 ring-1 ring-inset";
const TINT = "bg-[var(--accent-green)]/8 ring-[var(--accent-green)]/25";
const ICON_BUTTON =
  "grid h-[18px] w-[18px] shrink-0 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]";

function progressLabel(update: UpdateInstall, target: string): { label: string; detail: string } {
  if (update.cancelling) return { label: "Cancelling...", detail: "" };
  if (update.phase === "installing") return { label: `Installing ${target}`, detail: "Restarting" };
  const known = update.phase === "downloading" && update.progress >= 0;
  return { label: `Downloading ${target}`, detail: known ? `${update.progress}%` : "" };
}

// The running version sits beside the new one so the row can't be read as the
// version you have; the row itself fills up while the update downloads.
export function SidebarUpdateRow({ currentVersion, latestVersion, update, onUpdate }: SidebarUpdateRowProps) {
  const target = latestVersion || "update";

  if (update.active) {
    const installing = update.phase === "installing";
    const { label, detail } = progressLabel(update, target);
    const fill = installing ? 100 : Math.max(0, update.progress);
    return (
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={installing || update.progress < 0 ? undefined : update.progress}
        className={`relative flex items-center overflow-hidden ${ROW} ${TINT}`}
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0 left-0 bg-[var(--accent-green)]/20 transition-[width] duration-200 ${installing ? "animate-pulse" : ""}`}
          style={{ width: `${fill}%` }}
        />
        <span className="relative flex min-w-0 flex-1 items-center gap-2">
          {installing && (
            <LoaderCircle size={13} className="shrink-0 animate-spin text-[var(--accent-green-text)]" />
          )}
          <span className="min-w-0 truncate text-xs text-[var(--text-primary)]">{label}</span>
          {detail && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-[var(--text-secondary)]">
              {detail}
            </span>
          )}
          {!installing && !update.cancelling && (
            <button
              onClick={update.cancel}
              aria-label="Cancel update"
              title="Cancel update"
              className={`${detail ? "" : "ml-auto"} ${ICON_BUTTON}`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      </div>
    );
  }

  if (update.error) {
    return (
      <div role="alert" className={`flex flex-col gap-1 ${ROW} bg-[var(--accent-red)]/8 ring-[var(--accent-red)]/30`}>
        <span className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-primary)]">Update failed</span>
          <button
            onClick={onUpdate}
            className="ml-auto rounded px-1 text-[11px] font-medium text-[var(--accent-green-text)] transition-colors hover:bg-[var(--bg-active)]"
          >
            Retry
          </button>
          <button onClick={update.dismissError} aria-label="Dismiss" title="Dismiss" className={ICON_BUTTON}>
            <X size={12} />
          </button>
        </span>
        <span title={update.error} className="line-clamp-2 text-[11px] text-[var(--text-muted)]">
          {update.error}
        </span>
      </div>
    );
  }

  const action = UPDATES_INSTALL_IN_APP ? "Update" : "Download";
  return (
    <button
      onClick={onUpdate}
      title={`${UPDATES_INSTALL_IN_APP ? "Update to" : "Download"} ${target}`}
      className={`flex items-center gap-2 ${ROW} ${TINT} text-left transition-colors hover:bg-[var(--accent-green)]/15`}
    >
      {currentVersion && (
        <>
          <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{currentVersion}</span>
          <ArrowRight size={11} className="shrink-0 text-[var(--text-muted)]" />
        </>
      )}
      <span className="min-w-0 truncate text-xs font-medium tabular-nums text-[var(--text-primary)]">
        {latestVersion}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-medium text-[var(--accent-green-text)]">
        {action}
        {!UPDATES_INSTALL_IN_APP && <ExternalLink size={10} />}
      </span>
    </button>
  );
}
