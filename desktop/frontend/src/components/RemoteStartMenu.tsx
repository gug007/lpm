import { RefreshIcon } from "./icons";
import type { ProfileInfo, ServiceInfo } from "../types";

// The remote Start/Stop chevron menu: pick a profile (starts the peer's project
// with it) or toggle individual services on/off. Mirrors the local StartMenu
// visually but omits its add/edit affordances — service and profile config are
// managed on the other Mac. A running service also gets a restart affordance,
// mirroring the local Controls restart.
export function RemoteStartMenu({
  profiles,
  services,
  activeProfile,
  running,
  runningServiceNames,
  onPickProfile,
  onToggleService,
  onRestartService,
}: {
  profiles: ProfileInfo[];
  services: ServiceInfo[];
  activeProfile: string;
  running: boolean;
  runningServiceNames: Set<string>;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onRestartService?: (name: string) => void;
}) {
  const showProfiles = services.length > 0 && profiles.length > 0;
  return (
    <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] max-w-[340px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
      {showProfiles && (
        <>
          <Section label="Profiles">
            {profiles.map((p) => (
              <Row
                key={p.name}
                running={running && activeProfile === p.name}
                onClick={() => onPickProfile(p.name)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px]">{p.name}</span>
                  <span className="truncate font-mono text-[11px] text-[var(--text-muted)]">
                    {p.services.join(" · ")}
                  </span>
                </span>
              </Row>
            ))}
          </Section>
          <div className="mx-4 border-t border-[var(--border)]" />
        </>
      )}
      <Section label="Services">
        {services.map((s) => {
          const svcRunning = runningServiceNames.has(s.name);
          return (
            <Row
              key={s.name}
              running={svcRunning}
              onClick={() => onToggleService(s.name)}
            >
              <span className="flex-1 truncate font-mono text-[13px]">
                {s.name}
              </span>
              {s.port > 0 && (
                <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                  :{s.port}
                </span>
              )}
              {svcRunning && onRestartService && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestartService(s.name);
                  }}
                  title={`Restart ${s.name}`}
                  aria-label={`Restart ${s.name}`}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                >
                  <RefreshIcon />
                </button>
              )}
            </Row>
          );
        })}
        {services.length === 0 && (
          <div className="px-4 py-2 text-[12px] text-[var(--text-muted)]">
            No services in this project.
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pt-2 pb-1.5">
      <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  running,
  onClick,
  children,
}: {
  running?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] ${
        running
          ? "font-medium text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running && (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
        )}
      </span>
      {children}
    </button>
  );
}
