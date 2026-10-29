import { useState, type ReactNode } from "react";
import { openReleasePage, UPDATES_INSTALL_IN_APP } from "../../releasePage";
import { relativeAgo } from "../../relativeTime";
import { rowProps } from "../../settings-registry";
import { checkForUpdate, useUpdateCheck } from "../../store/updateCheck";
import type { UpdateInstallState } from "../../store/updateInstall";
import { SettingsRow } from "../SettingsRow";
import { BTN_SECONDARY } from "../ui/buttons";
import type { UpdateInstall } from "../useUpdateInstall";
import { Spinner } from "./Spinner";
import { UpdateSplitButton } from "./UpdateSplitButton";

function installDescription({ phase, progress, cancelling }: UpdateInstallState): string {
  if (cancelling) return "Cancelling update...";
  if (phase === "installing") return "Installing. lpm restarts in a moment.";
  return phase === "downloading" && progress >= 0 ? `Downloading... ${progress}%` : "Downloading...";
}

const LINK = "font-medium text-[var(--accent-green-text)] hover:underline";

// Settings › General › Updates: the lpm this Mac runs, and what's next for it.
export function UpdateStatusRow({ version, update }: { version: string; update: UpdateInstall }) {
  const info = useUpdateCheck((s) => s.info);
  const checkedAt = useUpdateCheck((s) => s.checkedAt);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");

  const check = async () => {
    setChecking(true);
    setCheckError("");
    update.dismissError();
    try {
      await checkForUpdate();
    } catch (err) {
      setCheckError(String(err));
    } finally {
      setChecking(false);
    }
  };

  const latest = info?.updateAvail ? info.latestVersion : "";
  const error = update.error || checkError;
  const checkButton = (
    <button onClick={() => void check()} className={BTN_SECONDARY}>
      Check now
    </button>
  );
  const updateButton = UPDATES_INSTALL_IN_APP ? (
    <UpdateSplitButton onNow={update.request} onWait={update.schedule} />
  ) : (
    <button
      onClick={() => openReleasePage(latest)}
      className="rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
    >
      Download
    </button>
  );

  let description: ReactNode;
  let control: ReactNode = null;
  let below: ReactNode = null;
  if (version === "dev") {
    description = "Updates aren't available in development builds";
  } else if (update.active) {
    description = installDescription(update);
    control = (
      <button
        onClick={update.cancel}
        disabled={update.cancelling || update.phase === "installing"}
        className={BTN_SECONDARY}
      >
        {update.phase === "installing" ? <Spinner /> : "Cancel"}
      </button>
    );
    if (update.phase === "downloading" && update.progress >= 0) {
      below = (
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[var(--bg-active)]">
          <div
            className="h-full bg-[var(--accent-green)] transition-[width] duration-200"
            style={{ width: `${update.progress}%` }}
          />
        </div>
      );
    }
  } else if (update.scheduled) {
    const { version: next, waiting } = update.scheduled;
    description = `${next} installs when agents finish${waiting ? ` · ${waiting}` : ""}`;
    control = (
      <>
        <button onClick={update.request} className={BTN_SECONDARY}>
          Update now
        </button>
        <button
          onClick={update.cancelScheduled}
          className="rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </>
    );
  } else if (checking) {
    description = "Checking...";
    control = (
      <button disabled className={BTN_SECONDARY}>
        <Spinner />
      </button>
    );
  } else if (error) {
    description = <span className="text-[var(--accent-red-text)]">{error}</span>;
    control = latest ? updateButton : checkButton;
  } else if (latest) {
    description = (
      <>
        {latest} is available ·{" "}
        <button onClick={() => openReleasePage(latest)} className={LINK}>
          What's new
        </button>
      </>
    );
    control = updateButton;
  } else if (info) {
    description = checkedAt ? `Up to date · checked ${relativeAgo(checkedAt)}` : "Up to date";
    control = checkButton;
  } else {
    description = "Check for new versions";
    control = checkButton;
  }

  return (
    <SettingsRow {...rowProps("general.updates")} description={description} below={below}>
      <div className="flex items-center gap-1">{control}</div>
    </SettingsRow>
  );
}
