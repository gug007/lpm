import { PlayIcon, StopIcon } from "../icons";
import type { ProfileInfo, ServiceInfo } from "../../types";

interface StartMenuProps {
  profiles: ProfileInfo[];
  services: ServiceInfo[];
  activeProfile: string;
  running: boolean;
  runningServiceNames: Set<string> | null;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
}

export function StartMenu({
  profiles,
  services,
  activeProfile,
  running,
  runningServiceNames,
  onPickProfile,
  onToggleService,
}: StartMenuProps) {
  const hasProfiles = profiles.length > 0;
  return (
    <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] max-w-[340px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
      {hasProfiles && (
        <Section label="Profiles">
          {profiles.map((p) => (
            <ProfileMenuItem
              key={p.name}
              profile={p}
              running={running && activeProfile === p.name}
              onClick={() => onPickProfile(p.name)}
            />
          ))}
        </Section>
      )}
      {hasProfiles && <div className="mx-4 border-t border-[var(--border)]" />}
      <Section label="Services">
        {services.map((s) => (
          <ServiceMenuItem
            key={s.name}
            label={s.name}
            running={runningServiceNames?.has(s.name)}
            badge={s.port > 0 ? `:${s.port}` : undefined}
            onClick={() => onToggleService(s.name)}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-2 pb-1.5">
      <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

interface ServiceMenuItemProps {
  label: string;
  running?: boolean;
  badge?: string;
  onClick: () => void;
}

function ServiceMenuItem({ label, running, badge, onClick }: ServiceMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
        running ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
        ) : null}
      </span>
      <span className="flex-1 truncate font-mono">{label}</span>
      {badge && <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{badge}</span>}
      <HoverRunIcon running={running} />
    </button>
  );
}

interface ProfileMenuItemProps {
  profile: ProfileInfo;
  running?: boolean;
  onClick: () => void;
}

function ProfileMenuItem({ profile, running, onClick }: ProfileMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] ${
        running ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="mt-[6px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[13px] ${running ? "font-medium" : ""}`}>
          {profile.name}
        </span>
        <span className="truncate text-[11px] text-[var(--text-muted)] font-mono">
          {profile.services.join(" · ")}
        </span>
      </span>
      <span className="mt-[6px]">
        <HoverRunIcon running={running} />
      </span>
    </button>
  );
}

function HoverRunIcon({ running }: { running?: boolean }) {
  return (
    <span className="opacity-0 transition-opacity group-hover:opacity-60 text-[var(--text-muted)]">
      {running ? <StopIcon /> : <PlayIcon />}
    </span>
  );
}
