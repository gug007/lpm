import { type MouseEvent, type RefObject } from "react";
import { OpenInDropdown } from "../OpenInDropdown";
import { ChevronDownIcon } from "../icons";
import { NO_DRAG_STYLE } from "./constants";
import { PortsButton } from "./PortsButton";
import { StartMenu } from "./StartMenu";
import type { ProfileInfo, ProjectInfo, ServiceInfo } from "../../types";

interface ControlsProps {
  project: ProjectInfo;
  loading: boolean;
  activeProfile: string;
  runningServiceNames: Set<string> | null;
  showProfileMenu: boolean;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  onToggleProfileMenu: () => void;
  onStart: () => void;
  onStop: () => void;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onAddService: () => void;
  onAddProfile: () => void;
  onEditService: (service: ServiceInfo) => void;
  onEditProfile: (profile: ProfileInfo) => void;
  onContextMenuService?: (e: MouseEvent, service: ServiceInfo) => void;
  onContextMenuProfile?: (e: MouseEvent, profile: ProfileInfo) => void;
}

export function Controls({
  project,
  loading,
  activeProfile,
  runningServiceNames,
  showProfileMenu,
  profileMenuRef,
  onToggleProfileMenu,
  onStart,
  onStop,
  onPickProfile,
  onToggleService,
  onAddService,
  onAddProfile,
  onEditService,
  onEditProfile,
  onContextMenuService,
  onContextMenuProfile,
}: ControlsProps) {
  return (
    <>
      {project.isRemote && <PortsButton projectName={project.name} />}
      <div style={NO_DRAG_STYLE}>
        <OpenInDropdown projectPath={project.root} isRemote={project.isRemote} />
      </div>
      <StartStopGroup
        project={project}
        loading={loading}
        activeProfile={activeProfile}
        runningServiceNames={runningServiceNames}
        showProfileMenu={showProfileMenu}
        profileMenuRef={profileMenuRef}
        onStart={onStart}
        onStop={onStop}
        onToggleProfileMenu={onToggleProfileMenu}
        onPickProfile={onPickProfile}
        onToggleService={onToggleService}
        onAddService={onAddService}
        onAddProfile={onAddProfile}
        onEditService={onEditService}
        onEditProfile={onEditProfile}
        onContextMenuService={onContextMenuService}
        onContextMenuProfile={onContextMenuProfile}
      />
    </>
  );
}

interface StartStopGroupProps {
  project: ProjectInfo;
  loading: boolean;
  activeProfile: string;
  runningServiceNames: Set<string> | null;
  showProfileMenu: boolean;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onStop: () => void;
  onToggleProfileMenu: () => void;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onAddService: () => void;
  onAddProfile: () => void;
  onEditService: (service: ServiceInfo) => void;
  onEditProfile: (profile: ProfileInfo) => void;
  onContextMenuService?: (e: MouseEvent, service: ServiceInfo) => void;
  onContextMenuProfile?: (e: MouseEvent, profile: ProfileInfo) => void;
}

function StartStopGroup({
  project,
  loading,
  activeProfile,
  runningServiceNames,
  showProfileMenu,
  profileMenuRef,
  onStart,
  onStop,
  onToggleProfileMenu,
  onPickProfile,
  onToggleService,
  onAddService,
  onAddProfile,
  onEditService,
  onEditProfile,
  onContextMenuService,
  onContextMenuProfile,
}: StartStopGroupProps) {
  // The chevron is always available so users can manage services and
  // profiles even when the project has zero or one service. Only the
  // primary Start/Stop button is hidden when there are no services to run.
  const hasServices = project.allServices.length > 0;
  const segmentHover = project.running
    ? "hover:bg-black/10"
    : "hover:bg-[var(--bg-primary)]/15";
  return (
    <div ref={profileMenuRef} className="relative flex" style={NO_DRAG_STYLE}>
      {hasServices ? (
        <div
          className={`inline-flex items-stretch rounded-lg border ${
            project.running
              ? "border-[var(--accent-red)] bg-[var(--accent-red)] text-white"
              : "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
          }`}
        >
          <button
            onClick={project.running ? onStop : onStart}
            disabled={loading}
            className={`rounded-l-lg px-3.5 py-1.5 text-xs font-medium transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${segmentHover}`}
          >
            {project.running ? "Stop" : "Start"}
          </button>
          <button
            onClick={onToggleProfileMenu}
            disabled={loading}
            aria-label="Services and profiles"
            className={`flex items-center rounded-r-lg border-l px-1.5 transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${
              project.running ? "border-white/20" : "border-[var(--bg-primary)]/20"
            } ${segmentHover} ${showProfileMenu ? (project.running ? "bg-black/10" : "bg-[var(--bg-primary)]/15") : ""}`}
          >
            <ChevronDownIcon />
          </button>
        </div>
      ) : (
        <button
          onClick={onToggleProfileMenu}
          disabled={loading}
          aria-label="Services and profiles"
          className={`rounded-lg border border-[var(--border)] px-1.5 py-1.5 transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[var(--terminal-header-active)] hover:text-[var(--text-primary)] ${
            showProfileMenu
              ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
          }`}
        >
          <ChevronDownIcon />
        </button>
      )}
      {showProfileMenu && (
        <StartMenu
          profiles={project.profiles}
          services={project.allServices}
          activeProfile={activeProfile}
          running={project.running}
          runningServiceNames={runningServiceNames}
          onPickProfile={onPickProfile}
          onToggleService={onToggleService}
          onAddService={onAddService}
          onAddProfile={onAddProfile}
          onEditService={onEditService}
          onEditProfile={onEditProfile}
          onContextMenuService={onContextMenuService}
          onContextMenuProfile={onContextMenuProfile}
        />
      )}
    </div>
  );
}
