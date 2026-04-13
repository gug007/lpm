"use client";

import { useState } from "react";
import {
  ChevronDown,
  Menu as MenuIcon,
  Pencil,
  RotateCcw,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";
import { SecondaryButton } from "./secondary-button";
import { SplitButton } from "./split-button";
import { StartMenuItem, StartMenuSection } from "./start-menu";
import type { Action, Service, TerminalItem } from "./types";

type ProfileEntry = [string, string[]];

export type HeaderProps = {
  projectName: string;
  services: Service[];
  plainActions: Action[];
  dropdownActions: Action[];
  menuActions: Action[];
  buttonTerminals: TerminalItem[];
  menuTerminals: TerminalItem[];
  profileEntries: ProfileEntry[];
  runningKeys: Set<string>;
  openTerminalKeys: Set<string>;
  effectiveRunning: boolean;
  onOpenAction: (a: Action) => void;
  onToggleTerminal: (key: string) => void;
  onStartStop: () => void;
  onStartProfile: (name: string) => void;
  onToggleService: (key: string) => void;
};

export function Header(props: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  const closeMenus = () => {
    setMenuOpen(false);
    setStartOpen(false);
  };

  const {
    projectName,
    services,
    plainActions,
    dropdownActions,
    menuActions,
    buttonTerminals,
    menuTerminals,
    profileEntries,
    runningKeys,
    openTerminalKeys,
    effectiveRunning,
    onOpenAction,
    onToggleTerminal,
    onStartStop,
    onStartProfile,
    onToggleService,
  } = props;

  const hasAnyService = services.length > 0;
  const showStartSplit = services.length > 1;
  const hasMenuItems = menuActions.length > 0 || menuTerminals.length > 0;

  const handleOpenAction = (a: Action) => {
    closeMenus();
    onOpenAction(a);
  };

  const handleToggleTerminal = (key: string) => {
    setMenuOpen(false);
    onToggleTerminal(key);
  };

  return (
    <div className="flex items-center gap-4 -mx-3 py-1">
      <h1 className="shrink-0 text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
        {projectName}
      </h1>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {plainActions.map((a) => (
          <SecondaryButton key={a.key} onClick={() => handleOpenAction(a)}>
            {a.label}
          </SecondaryButton>
        ))}
        {buttonTerminals.map((t) => (
          <SecondaryButton
            key={t.key}
            onClick={() => handleToggleTerminal(t.key)}
            active={openTerminalKeys.has(t.key)}
          >
            {t.label}
          </SecondaryButton>
        ))}
        {dropdownActions.map((a) => (
          <SplitButton key={a.key} action={a} onRun={handleOpenAction} />
        ))}

        {hasMenuItems && (
          <HamburgerMenu
            open={menuOpen}
            onToggle={() => {
              setStartOpen(false);
              setMenuOpen((v) => !v);
            }}
            onClose={() => setMenuOpen(false)}
            menuActions={menuActions}
            menuTerminals={menuTerminals}
            openTerminalKeys={openTerminalKeys}
            effectiveRunning={effectiveRunning}
            onOpenAction={handleOpenAction}
            onToggleTerminal={handleToggleTerminal}
          />
        )}

        {hasAnyService && (
          <StartSplitButton
            effectiveRunning={effectiveRunning}
            showStartSplit={showStartSplit}
            startOpen={startOpen}
            onStartStop={onStartStop}
            onToggleStartMenu={() => {
              setMenuOpen(false);
              setStartOpen((v) => !v);
            }}
            onCloseStartMenu={() => setStartOpen(false)}
            services={services}
            runningKeys={runningKeys}
            profileEntries={profileEntries}
            onStartProfile={onStartProfile}
            onToggleService={onToggleService}
          />
        )}
      </div>
    </div>
  );
}

function HamburgerMenu({
  open,
  onToggle,
  onClose,
  menuActions,
  menuTerminals,
  openTerminalKeys,
  effectiveRunning,
  onOpenAction,
  onToggleTerminal,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  menuActions: Action[];
  menuTerminals: TerminalItem[];
  openTerminalKeys: Set<string>;
  effectiveRunning: boolean;
  onOpenAction: (a: Action) => void;
  onToggleTerminal: (key: string) => void;
}) {
  const showDivider = menuActions.length > 0 || menuTerminals.length > 0;
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Project actions"
        className={`flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
          open
            ? "border-transparent bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
            : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
        }`}
      >
        <MenuIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 py-1 shadow-lg"
          onMouseLeave={onClose}
        >
          {menuActions.length > 0 && (
            <StartMenuSection label="Actions">
              {menuActions.map((a) => (
                <StartMenuItem
                  key={a.key}
                  label={a.label}
                  mono
                  showDot={false}
                  icon={<Terminal className="w-3 h-3" />}
                  onClick={() => onOpenAction(a)}
                />
              ))}
            </StartMenuSection>
          )}
          {menuTerminals.length > 0 && (
            <>
              {menuActions.length > 0 && <MenuDivider />}
              <StartMenuSection label="Terminals">
                {menuTerminals.map((t) => (
                  <StartMenuItem
                    key={t.key}
                    label={t.label}
                    mono
                    showDot={false}
                    icon={<Terminal className="w-3 h-3" />}
                    showCheck={openTerminalKeys.has(t.key)}
                    onClick={() => onToggleTerminal(t.key)}
                  />
                ))}
              </StartMenuSection>
            </>
          )}
          {showDivider && <MenuDivider />}
          <StartMenuSection label="Project">
            <StartMenuItem
              label="Edit Config"
              showDot={false}
              icon={<Pencil className="w-3 h-3" />}
              shortcut="⌘E"
            />
            <StartMenuItem
              label="Terminal Settings"
              showDot={false}
              icon={<Settings className="w-3 h-3" />}
            />
            {effectiveRunning && (
              <StartMenuItem
                label="Restart"
                showDot={false}
                icon={<RotateCcw className="w-3 h-3" />}
              />
            )}
          </StartMenuSection>
          <MenuDivider />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <span className="flex-shrink-0">
              <Trash2 className="w-3 h-3" />
            </span>
            <span className="flex-1 truncate">Remove</span>
          </button>
        </div>
      )}
    </div>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-gray-200 dark:border-gray-800" />;
}

function StartSplitButton({
  effectiveRunning,
  showStartSplit,
  startOpen,
  onStartStop,
  onToggleStartMenu,
  onCloseStartMenu,
  services,
  runningKeys,
  profileEntries,
  onStartProfile,
  onToggleService,
}: {
  effectiveRunning: boolean;
  showStartSplit: boolean;
  startOpen: boolean;
  onStartStop: () => void;
  onToggleStartMenu: () => void;
  onCloseStartMenu: () => void;
  services: Service[];
  runningKeys: Set<string>;
  profileEntries: ProfileEntry[];
  onStartProfile: (name: string) => void;
  onToggleService: (key: string) => void;
}) {
  const mainShapeClass = showStartSplit ? "rounded-l-lg" : "rounded-lg";
  const mainColorClass = effectiveRunning
    ? "bg-red-500 text-white"
    : "bg-gray-900 text-white dark:bg-white dark:text-gray-900";
  const chevronColorClass = effectiveRunning
    ? "border-white/20 bg-red-500 text-white"
    : "border-white/20 dark:border-gray-900/20 bg-gray-900 text-white dark:bg-white dark:text-gray-900";

  return (
    <div className="relative flex shrink-0">
      <button
        type="button"
        onClick={onStartStop}
        className={`${mainShapeClass} px-3.5 py-1.5 text-xs font-medium transition-all hover:opacity-85 ${mainColorClass}`}
      >
        {effectiveRunning ? "Stop" : "Start"}
      </button>
      {showStartSplit && (
        <button
          type="button"
          onClick={onToggleStartMenu}
          className={`rounded-r-lg border-l px-1.5 py-1.5 transition-all hover:opacity-85 ${chevronColorClass}`}
        >
          <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      )}
      {showStartSplit && startOpen && (
        <StartDropdown
          services={services}
          runningKeys={runningKeys}
          profileEntries={profileEntries}
          effectiveRunning={effectiveRunning}
          onStartProfile={onStartProfile}
          onToggleService={onToggleService}
          onMouseLeave={onCloseStartMenu}
        />
      )}
    </div>
  );
}

function StartDropdown({
  services,
  runningKeys,
  profileEntries,
  effectiveRunning,
  onStartProfile,
  onToggleService,
  onMouseLeave,
}: {
  services: Service[];
  runningKeys: Set<string>;
  profileEntries: ProfileEntry[];
  effectiveRunning: boolean;
  onStartProfile: (name: string) => void;
  onToggleService: (key: string) => void;
  onMouseLeave: () => void;
}) {
  const isProfileActive = (serviceKeys: string[]) =>
    effectiveRunning &&
    serviceKeys.length === runningKeys.size &&
    serviceKeys.every((k) => runningKeys.has(k));

  return (
    <div
      className="absolute right-0 top-full z-50 mt-1.5 min-w-[240px] max-w-[300px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl"
      onMouseLeave={onMouseLeave}
    >
      {profileEntries.length > 0 && (
        <>
          <StartMenuSection label="Profiles">
            {profileEntries.map(([name, keys]) => {
              const resolved = keys.filter((k) =>
                services.some((s) => s.key === k),
              );
              const active = isProfileActive(resolved);
              return (
                <StartMenuItem
                  key={name}
                  label={name}
                  subtext={resolved.join(" · ")}
                  running={active}
                  showCheck={active}
                  onClick={() => onStartProfile(name)}
                />
              );
            })}
          </StartMenuSection>
          <div className="mx-3 border-t border-gray-200 dark:border-gray-800" />
        </>
      )}
      <StartMenuSection label="Services">
        {services.map((s) => (
          <StartMenuItem
            key={s.key}
            label={s.key}
            mono
            running={runningKeys.has(s.key)}
            onClick={() => onToggleService(s.key)}
          />
        ))}
      </StartMenuSection>
    </div>
  );
}
