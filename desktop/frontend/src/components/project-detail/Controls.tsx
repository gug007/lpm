import { type MouseEvent, type RefObject } from "react";
import { OpenInDropdown } from "../OpenInDropdown";
import { ChevronDownIcon, MenuIcon } from "../icons";
import { NO_DRAG_STYLE } from "./constants";
import { PortsButton } from "./PortsButton";
import { QuickPopover } from "./QuickPopover";
import { StartMenu } from "./StartMenu";
import type { ActionInfo, ProfileInfo, ProjectInfo, ServiceInfo } from "../../types";

interface ControlsProps {
  project: ProjectInfo;
  loading: boolean;
  activeProfile: string;
  menuActions: ActionInfo[];
  runningAction: ActionInfo | null;
  runningServiceNames: Set<string> | null;
  showQuickMenu: boolean;
  showProfileMenu: boolean;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  onToggleQuickMenu: () => void;
  onCloseQuickMenu: () => void;
  onToggleProfileMenu: () => void;
  onStart: () => void;
  onStop: () => void;
  onPickProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onRunAction: (action: ActionInfo) => void;
  onEditConfig: () => void;
  onOpenNotes: () => void;
  onRestart: () => void;
  onRequestRemove: () => void;
  onShowTerminalSettings: () => void;
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
  menuActions,
  runningAction,
  runningServiceNames,
  showQuickMenu,
  showProfileMenu,
  profileMenuRef,
  onToggleQuickMenu,
  onCloseQuickMenu,
  onToggleProfileMenu,
  onStart,
  onStop,
  onPickProfile,
  onToggleService,
  onRunAction,
  onEditConfig,
  onOpenNotes,
  onRestart,
  onRequestRemove,
  onShowTerminalSettings,
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
        <OpenInDropdown projectPath={project.root} />
      </div>
      <div className="relative" style={NO_DRAG_STYLE}>
        <button
          onClick={onToggleQuickMenu}
          aria-label="Project actions"
          className={`flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
            showQuickMenu
              ? "border-transparent bg-[var(--bg-active)] text-[var(--text-primary)]"
              : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          }`}
        >
          <MenuIcon />
        </button>
        {showQuickMenu && (
          <QuickPopover
            actions={menuActions}
            running={project.running}
            actionBusy={runningAction !== null}
            onClose={onCloseQuickMenu}
            onRunAction={onRunAction}
            onEditConfig={onEditConfig}
            onOpenNotes={onOpenNotes}
            onRestart={onRestart}
            onRemove={onRequestRemove}
            onTerminalSettings={onShowTerminalSettings}
          />
        )}
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
  return (
    <div ref={profileMenuRef} className="relative flex" style={NO_DRAG_STYLE}>
      {hasServices ? (
        project.running ? (
          <button
            onClick={onStop}
            disabled={loading}
            className="rounded-l-lg px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 bg-[var(--accent-red)] text-white hover:opacity-85"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={onStart}
            disabled={loading}
            className="rounded-l-lg px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 bg-[var(--text-primary)] text-[var(--bg-primary)] hover:opacity-85"
          >
            Start
          </button>
        )
      ) : null}
      <button
        onClick={onToggleProfileMenu}
        disabled={loading}
        aria-label="Services and profiles"
        className={`${hasServices ? "rounded-r-lg border-l" : "rounded-lg border"} px-1.5 py-1.5 transition-all disabled:opacity-40 hover:opacity-85 ${
          hasServices
            ? project.running
              ? "border-white/20 bg-[var(--accent-red)] text-white"
              : "border-[var(--bg-primary)]/20 bg-[var(--text-primary)] text-[var(--bg-primary)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        }`}
      >
        <ChevronDownIcon />
      </button>
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
