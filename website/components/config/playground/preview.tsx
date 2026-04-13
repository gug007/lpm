"use client";

import { useMemo, useState } from "react";
import { ActionModal } from "./action-modal";
import { EmptyState } from "./empty-state";
import { Header } from "./header";
import {
  buildPanes,
  normalizeAction,
  normalizeService,
  normalizeTerminal,
} from "./normalize";
import { RunningView } from "./running-view";
import type {
  Action,
  ModalPhase,
  RawConfig,
  Service,
  TerminalItem,
} from "./types";

const ALL_TAB = "all";

type SelectedAction = {
  action: Action;
  initialPhase: ModalPhase;
};

export function PlaygroundPreview({
  config,
  error,
}: {
  config: RawConfig | null;
  error: string | null;
}) {
  const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set());
  const [openTerminalKeys, setOpenTerminalKeys] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [selectedAction, setSelectedAction] = useState<SelectedAction | null>(
    null,
  );

  const services = useMemo<Service[]>(
    () =>
      config?.services
        ? Object.entries(config.services).map(([k, v]) =>
            normalizeService(k, v),
          )
        : [],
    [config],
  );
  const actions = useMemo<Action[]>(
    () =>
      config?.actions
        ? Object.entries(config.actions).map(([k, v]) => normalizeAction(k, v))
        : [],
    [config],
  );
  const terminals = useMemo<TerminalItem[]>(
    () =>
      config?.terminals
        ? Object.entries(config.terminals).map(([k, v]) =>
            normalizeTerminal(k, v),
          )
        : [],
    [config],
  );
  const profileEntries = useMemo<[string, string[]][]>(
    () =>
      config?.profiles
        ? Object.entries(config.profiles).filter(([, v]) => Array.isArray(v))
        : [],
    [config],
  );

  const buttonActions = actions.filter((a) => a.display === "button");
  const plainActions = buttonActions.filter((a) => a.children.length === 0);
  const dropdownActions = buttonActions.filter((a) => a.children.length > 0);
  const menuActions = actions.filter((a) => a.display !== "button");
  const buttonTerminals = terminals.filter((t) => t.display === "button");
  const menuTerminals = terminals.filter((t) => t.display !== "button");

  const runningServices = useMemo(
    () => services.filter((s) => runningKeys.has(s.key)),
    [services, runningKeys],
  );
  const openTerminals = useMemo(
    () => terminals.filter((t) => openTerminalKeys.has(t.key)),
    [terminals, openTerminalKeys],
  );
  const panes = useMemo(
    () => buildPanes(runningServices, openTerminals, config),
    [runningServices, openTerminals, config],
  );
  const visiblePanes = useMemo(
    () =>
      activeTab === ALL_TAB || !panes.some((p) => p.id === activeTab)
        ? panes
        : panes.filter((p) => p.id === activeTab),
    [activeTab, panes],
  );

  const projectName = config?.name ?? "";
  const hasAnyService = services.length > 0;
  const effectiveRunning = runningServices.length > 0;
  const hasAnyPane = effectiveRunning || openTerminals.length > 0;

  const openAction = (action: Action) => {
    setSelectedAction({
      action,
      initialPhase: action.confirm ? "idle" : "running",
    });
  };

  const toggleTerminal = (key: string) => {
    setOpenTerminalKeys((prev) => toggle(prev, key));
    setActiveTab(ALL_TAB);
  };

  const toggleService = (key: string) => {
    setRunningKeys((prev) => toggle(prev, key));
    setActiveTab(ALL_TAB);
  };

  const startAllServices = () => {
    setRunningKeys(new Set(services.map((s) => s.key)));
    setActiveTab(ALL_TAB);
  };

  const stopAllServices = () => {
    setRunningKeys(new Set());
  };

  const startProfile = (profileName: string) => {
    const entry = profileEntries.find(([k]) => k === profileName);
    const keys = entry
      ? entry[1].filter((name) => services.some((s) => s.key === name))
      : [];
    setRunningKeys(new Set(keys));
    setActiveTab(ALL_TAB);
  };

  const handleStartStop = () => {
    if (effectiveRunning) stopAllServices();
    else startAllServices();
  };

  return (
    <div className="relative h-full flex flex-col bg-white dark:bg-gray-950">
      {error && <ErrorBanner message={error} />}

      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 min-h-0">
        <Header
          projectName={projectName}
          services={services}
          plainActions={plainActions}
          dropdownActions={dropdownActions}
          menuActions={menuActions}
          buttonTerminals={buttonTerminals}
          menuTerminals={menuTerminals}
          profileEntries={profileEntries}
          runningKeys={runningKeys}
          openTerminalKeys={openTerminalKeys}
          effectiveRunning={effectiveRunning}
          onOpenAction={openAction}
          onToggleTerminal={toggleTerminal}
          onStartStop={handleStartStop}
          onStartProfile={startProfile}
          onToggleService={toggleService}
        />

        {hasAnyPane ? (
          <RunningView
            panes={panes}
            visiblePanes={visiblePanes}
            activeTab={activeTab}
            projectName={projectName}
            onTabChange={setActiveTab}
            onCloseTerminal={toggleTerminal}
          />
        ) : (
          <EmptyState projectName={projectName} hasAnyService={hasAnyService} />
        )}
      </div>

      {selectedAction && (
        <ActionModal
          action={selectedAction.action}
          initialPhase={selectedAction.initialPhase}
          onClose={() => setSelectedAction(null)}
        />
      )}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex-shrink-0 px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-950 text-[11px] text-red-700 dark:text-red-300 font-mono">
      {message}
    </div>
  );
}

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}
