import type { MouseEvent } from "react";
import { PencilIcon, PlayIcon, PlusIcon, StopIcon } from "../icons";
import type { ProfileInfo, ServiceInfo } from "../../types";

interface StartMenuProps {
  profiles: ProfileInfo[];
  services: ServiceInfo[];
  activeProfile: string;
  running: boolean;
  runningServiceNames: Set<string> | null;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onAddService: () => void;
  onAddProfile: () => void;
  onEditService: (service: ServiceInfo) => void;
  onEditProfile: (profile: ProfileInfo) => void;
  onContextMenuService?: (e: MouseEvent, service: ServiceInfo) => void;
  onContextMenuProfile?: (e: MouseEvent, profile: ProfileInfo) => void;
}

export function StartMenu({
  profiles,
  services,
  activeProfile,
  running,
  runningServiceNames,
  onPickProfile,
  onToggleService,
  onAddService,
  onAddProfile,
  onEditService,
  onEditProfile,
  onContextMenuService,
  onContextMenuProfile,
}: StartMenuProps) {
  // Profiles section is always shown when at least one service exists, so the
  // user has somewhere to land "+ Add profile". With no services, profiles
  // would have nothing to bundle, so the section stays hidden.
  const showProfilesSection = services.length > 0;
  return (
    <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] max-w-[340px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
      {showProfilesSection && (
        <Section label="Profiles">
          {profiles.map((p) => (
            <ProfileMenuItem
              key={p.name}
              profile={p}
              running={running && activeProfile === p.name}
              onClick={() => onPickProfile(p.name)}
              onEdit={() => onEditProfile(p)}
              onContextMenu={onContextMenuProfile}
            />
          ))}
          <AddMenuItem label="Add profile" onClick={onAddProfile} />
        </Section>
      )}
      {showProfilesSection && <div className="mx-4 border-t border-[var(--border)]" />}
      <Section label="Services">
        {services.map((s) => (
          <ServiceMenuItem
            key={s.name}
            service={s}
            running={runningServiceNames?.has(s.name)}
            onClick={() => onToggleService(s.name)}
            onEdit={() => onEditService(s)}
            onContextMenu={onContextMenuService}
          />
        ))}
        <AddMenuItem label="Add service" onClick={onAddService} />
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
  service: ServiceInfo;
  running?: boolean;
  onClick: () => void;
  onEdit: () => void;
  onContextMenu?: (e: MouseEvent, service: ServiceInfo) => void;
}

function ServiceMenuItem({ service, running, onClick, onEdit, onContextMenu }: ServiceMenuItemProps) {
  const badge = service.port > 0 ? `:${service.port}` : undefined;
  return (
    <div
      className={`group relative flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
        running ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"
      }`}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, service) : undefined}
    >
      <button
        onClick={onClick}
        className="flex flex-1 items-center gap-2.5 text-left"
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {running ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
          ) : null}
        </span>
        <span className="flex-1 truncate font-mono">{service.name}</span>
        {badge && (
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{badge}</span>
        )}
      </button>
      <RowActions onEdit={onEdit} hoverIcon={running ? <StopIcon /> : <PlayIcon />} />
    </div>
  );
}

interface ProfileMenuItemProps {
  profile: ProfileInfo;
  running?: boolean;
  onClick: () => void;
  onEdit: () => void;
  onContextMenu?: (e: MouseEvent, profile: ProfileInfo) => void;
}

function ProfileMenuItem({ profile, running, onClick, onEdit, onContextMenu }: ProfileMenuItemProps) {
  return (
    <div
      className={`group relative flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] ${
        running ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
      }`}
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, profile) : undefined}
    >
      <button
        onClick={onClick}
        className="flex flex-1 items-start gap-2.5 text-left"
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
      </button>
      <RowActions onEdit={onEdit} hoverIcon={running ? <StopIcon /> : <PlayIcon />} alignTop />
    </div>
  );
}

function RowActions({
  onEdit,
  hoverIcon,
  alignTop = false,
}: {
  onEdit: () => void;
  hoverIcon: React.ReactNode;
  alignTop?: boolean;
}) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 ${alignTop ? "mt-[6px]" : ""}`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label="Edit"
        className="rounded p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] group-hover:opacity-100"
      >
        <PencilIcon size={12} />
      </button>
      <span className="text-[var(--text-muted)] opacity-0 transition-opacity group-hover:opacity-60">
        {hoverIcon}
      </span>
    </span>
  );
}

function AddMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        <PlusIcon />
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
