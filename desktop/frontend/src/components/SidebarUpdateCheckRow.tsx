import { Check, CircleAlert, CircleArrowUp, Clock, LoaderCircle, RotateCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { UPDATES_INSTALL_IN_APP } from "../releasePage";
import { useAppVersion } from "../store/releaseVersions";
import { checkForUpdate, useUpdateCheck } from "../store/updateCheck";
import { useUpdateInstallState } from "../store/updateInstall";

export const UP_TO_DATE_MS = 4000;

type Phase = "idle" | "checking" | "current" | "failed";

interface SidebarUpdateCheckRowProps {
  divider: boolean;
  onUpdate: () => void;
}

const ICON = { size: 14, strokeWidth: 2, className: "shrink-0" };
const GREEN = "text-[var(--accent-green-text)]";

// The More menu's update check answers in its own row, so the menu stays open;
// a release it finds, or the background check found, is offered right there.
export function SidebarUpdateCheckRow({ divider, onUpdate }: SidebarUpdateCheckRowProps) {
  const version = useAppVersion();
  const info = useUpdateCheck((s) => s.info);
  const installing = useUpdateInstallState((s) => s.active);
  const scheduled = useUpdateInstallState((s) => s.scheduled);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (phase !== "current") return;
    const timer = window.setTimeout(() => setPhase("idle"), UP_TO_DATE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (version === "dev") return null;

  const check = async () => {
    setPhase("checking");
    setError("");
    try {
      const next = await checkForUpdate();
      setPhase(next?.updateAvail ? "idle" : "current");
    } catch (err) {
      setError(String(err));
      setPhase("failed");
    }
  };

  const latest = info?.updateAvail ? info.latestVersion : "";
  let icon: ReactNode = <RotateCw {...ICON} />;
  let label = "Check for updates";
  let trailing: ReactNode = null;
  let onClick: (() => void) | undefined = () => void check();
  let title: string | undefined;

  if (installing) {
    icon = <LoaderCircle {...ICON} className="shrink-0 animate-spin" />;
    label = "Updating…";
    onClick = undefined;
  } else if (scheduled) {
    icon = <Clock {...ICON} />;
    label = "Waiting for agents";
    title = `${scheduled.version} installs once agents finish`;
    onClick = undefined;
  } else if (phase === "checking") {
    icon = <LoaderCircle {...ICON} className="shrink-0 animate-spin" />;
    label = "Checking…";
    onClick = undefined;
  } else if (phase === "failed") {
    icon = <CircleAlert {...ICON} className="shrink-0 text-[var(--accent-red-text)]" />;
    label = "Couldn't check";
    trailing = <span className={GREEN}>Retry</span>;
    title = error;
  } else if (latest) {
    icon = <CircleArrowUp {...ICON} className={`shrink-0 ${GREEN}`} />;
    label = `${latest} is out`;
    trailing = <span className={GREEN}>{UPDATES_INSTALL_IN_APP ? "Update" : "Download"}</span>;
    onClick = onUpdate;
  } else if (phase === "current") {
    icon = <Check {...ICON} className={`shrink-0 ${GREEN}`} />;
    label = "Up to date";
    const current = info?.currentVersion || version;
    trailing = current ? <span className="tabular-nums text-[var(--text-muted)]">{current}</span> : null;
  }

  return (
    <>
      {divider && <div className="my-1 h-px bg-[var(--border)]" />}
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        title={title}
        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          onClick
            ? "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            : "text-[var(--text-muted)]"
        }`}
      >
        {icon}
        <span aria-live="polite" className="truncate">
          {label}
        </span>
        {trailing && (
          <span className="ml-auto shrink-0 whitespace-nowrap pl-2 text-[10px] font-medium">{trailing}</span>
        )}
      </button>
    </>
  );
}
