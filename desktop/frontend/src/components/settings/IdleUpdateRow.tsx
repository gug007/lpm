import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import { MACHINE } from "../../machineWords";
import { rowProps } from "../../settings-registry";
import { useSettingsStore } from "../../store/settings";
import { useUpdateCheck } from "../../store/updateCheck";
import { useUpdateInstallState } from "../../store/updateInstall";
import { SettingsRow } from "../SettingsRow";
import { Toggle } from "../ui/Toggle";

// Settings › General › Updates: this machine installs its own updates while nobody
// is using it. Off unless chosen, since the install restarts lpm.
export function IdleUpdateRow() {
  const enabled = useSettingsStore((s) => s.installUpdatesWhenIdle ?? false);
  const update = useSettingsStore((s) => s.update);
  const info = useUpdateCheck((s) => s.info);
  const waitingForAgents = useUpdateInstallState((s) => s.scheduled !== null || s.active);

  let next: ReactNode = null;
  if (enabled && info?.updateAvail && !waitingForAgents) {
    next = (
      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--accent-green-text)]">
        <Clock size={11} className="shrink-0" />
        {info.latestVersion} installs the next time you're away
      </p>
    );
  } else if (enabled && info && !info.updateAvail) {
    next = <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Looks for a new version every hour</p>;
  }

  return (
    <SettingsRow
      {...rowProps("general.idleUpdates")}
      below={next}
      details={
        <>
          <p>lpm looks for a new version every hour and installs it once:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>nobody has used {MACHINE.thisMachine} for 10 minutes</li>
            <li>no agent is working or waiting for you</li>
            <li>no action is running</li>
            <li>every terminal is back at its prompt</li>
          </ul>
          <p>Installing restarts lpm. Agents reopen in their conversations, and services keep running.</p>
        </>
      }
    >
      <Toggle
        aria-label="Install updates automatically"
        enabled={enabled}
        onChange={(v) => void update({ installUpdatesWhenIdle: v || undefined })}
      />
    </SettingsRow>
  );
}
