import { useEffect, useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { ChevronDownIcon } from "./icons";
import { RemoteStartMenu } from "./RemoteStartMenu";
import type { ProfileInfo, ServiceInfo } from "../types";

// The remote header's Start/Stop control, mirroring the local StartStopGroup: a
// primary Start/Stop plus a chevron opening the profile/service menu. Start uses
// the active profile; picking a profile starts the peer's project with it.
export function RemoteStartStopGroup({
  running,
  profiles,
  services,
  activeProfile,
  runningServiceNames,
  onStart,
  onStop,
  onToggleService,
  onRestartService,
}: {
  running: boolean;
  profiles: ProfileInfo[];
  services: ServiceInfo[];
  activeProfile: string;
  runningServiceNames: Set<string>;
  onStart: (profile: string) => void;
  onStop: () => void;
  onToggleService: (name: string) => void;
  onRestartService?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(activeProfile);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  useEffect(() => {
    if (activeProfile) setActive(activeProfile);
  }, [activeProfile]);

  const hasServices = services.length > 0;
  const pickProfile = (name: string) => {
    setActive(name);
    setOpen(false);
    onStart(name);
  };

  return (
    <div ref={ref} className="relative flex">
      {hasServices &&
        (running ? (
          <button
            onClick={onStop}
            className="rounded-l-lg bg-[var(--accent-red)] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={() => onStart(active)}
            className="rounded-l-lg bg-[var(--accent-green)] px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-85"
          >
            Start
          </button>
        ))}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Services and profiles"
        className={`px-1.5 py-1.5 transition-opacity hover:opacity-85 ${
          hasServices
            ? `rounded-r-lg border-l text-white ${
                running
                  ? "border-white/20 bg-[var(--accent-red)]"
                  : "border-white/20 bg-[var(--accent-green)]"
              }`
            : "rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <ChevronDownIcon />
      </button>
      {open && (
        <RemoteStartMenu
          profiles={profiles}
          services={services}
          activeProfile={active}
          running={running}
          runningServiceNames={runningServiceNames}
          onPickProfile={pickProfile}
          onToggleService={onToggleService}
          onRestartService={onRestartService}
        />
      )}
    </div>
  );
}
