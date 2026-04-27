"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ActionModal } from "./action-modal";
import { BackgroundToasts, type BackgroundToast } from "./background-toasts";
import { EmptyState } from "./empty-state";
import { Header } from "./header";
import {
  buildPanes,
  normalizeAction,
  normalizeService,
  normalizeTerminal,
  sortByPosition,
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
  const [toasts, setToasts] = useState<BackgroundToast[]>([]);
  const toastTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      toastTimers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
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
        ? sortByPosition(
            Object.entries(config.actions).map(([k, v]) =>
              normalizeAction(k, v),
            ),
          )
        : [],
    [config],
  );
  const terminals = useMemo<TerminalItem[]>(
    () =>
      config?.terminals
        ? sortByPosition(
            Object.entries(config.terminals).map(([k, v]) =>
              normalizeTerminal(k, v),
            ),
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

  const headerActions = actions.filter((a) => a.display === "header");
  const plainActions = headerActions.filter((a) => a.children.length === 0);
  const dropdownActions = headerActions.filter((a) => a.children.length > 0);
  const footerActions = actions.filter((a) => a.display === "footer");
  const menuActions = actions.filter((a) => a.display === "menu");
  const headerTerminals = terminals.filter((t) => t.display === "header");
  const menuTerminals = terminals.filter((t) => t.display === "menu");

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

  const runBackgroundAction = (action: Action) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, label: action.label, phase: "running" }]);
    const finishTimer = window.setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, phase: "success" } : t)),
      );
      const dismissTimer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 1800);
      toastTimers.current.push(dismissTimer);
    }, 900);
    toastTimers.current.push(finishTimer);
  };

  const openAction = (action: Action) => {
    if (action.type === "background") {
      if (action.confirm) {
        setSelectedAction({ action, initialPhase: "idle" });
      } else {
        runBackgroundAction(action);
      }
      return;
    }
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
    <div className="dark relative h-full flex flex-col bg-[#1a1a1a]">
      {error && <ErrorBanner message={error} />}

      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 min-h-0">
        <Header
          projectName={projectName}
          services={services}
          plainActions={plainActions}
          dropdownActions={dropdownActions}
          menuActions={menuActions}
          headerTerminals={headerTerminals}
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

        {hasAnyPane && footerActions.length > 0 && (
          <div className="flex items-center justify-end gap-1.5 border-x border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 py-1.5">
            {footerActions.map((action) => (
              <button
                key={action.key}
                onClick={() => openAction(action)}
                className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedAction && (
        <ActionModal
          action={selectedAction.action}
          initialPhase={selectedAction.initialPhase}
          onClose={() => setSelectedAction(null)}
          onRun={
            selectedAction.action.type === "background"
              ? () => {
                  const action = selectedAction.action;
                  setSelectedAction(null);
                  runBackgroundAction(action);
                }
              : undefined
          }
        />
      )}

      <BackgroundToasts toasts={toasts} />
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
