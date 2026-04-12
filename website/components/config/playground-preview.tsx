"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Menu as MenuIcon, Terminal } from "lucide-react";

type ServiceDef =
  | string
  | {
      cmd?: string;
      cwd?: string;
      port?: number;
      env?: Record<string, string>;
      profiles?: string[];
    };

type ActionDef =
  | string
  | {
      cmd?: string;
      label?: string;
      cwd?: string;
      env?: Record<string, string>;
      confirm?: boolean;
      display?: "button" | "menu";
      actions?: Record<string, ActionDef>;
    };

type TerminalDef =
  | string
  | {
      cmd?: string;
      label?: string;
      cwd?: string;
      env?: Record<string, string>;
      display?: "button" | "menu";
    };

export type RawConfig = {
  name?: string;
  root?: string;
  services?: Record<string, ServiceDef>;
  actions?: Record<string, ActionDef>;
  terminals?: Record<string, TerminalDef>;
  profiles?: Record<string, string[]>;
};

type Service = { key: string; cmd: string; port?: number };
type Action = {
  key: string;
  cmd?: string;
  label: string;
  display: "button" | "menu";
  children: Action[];
};
type TerminalItem = {
  key: string;
  label: string;
  display: "button" | "menu";
};

function normalizeService(key: string, def: ServiceDef): Service {
  if (typeof def === "string") return { key, cmd: def };
  return {
    key,
    cmd: def?.cmd ?? "",
    port: typeof def?.port === "number" ? def.port : undefined,
  };
}

function normalizeAction(key: string, def: ActionDef): Action {
  if (typeof def === "string") {
    return { key, cmd: def, label: key, display: "menu", children: [] };
  }
  const children = def?.actions
    ? Object.entries(def.actions).map(([k, v]) => normalizeAction(k, v))
    : [];
  return {
    key,
    cmd: def?.cmd,
    label: def?.label ?? key,
    display: def?.display === "button" ? "button" : "menu",
    children,
  };
}

function normalizeTerminal(key: string, def: TerminalDef): TerminalItem {
  if (typeof def === "string") {
    return { key, label: key, display: "menu" };
  }
  return {
    key,
    label: def?.label ?? key,
    display: def?.display === "button" ? "button" : "menu",
  };
}

function SecondaryButton({
  children,
  onClick,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SplitButton({ action }: { action: Action }) {
  const [open, setOpen] = useState(false);
  const hasCmd = !!action.cmd;

  if (!hasCmd) {
    return (
      <div className="relative shrink-0">
        <SecondaryButton onClick={() => setOpen((v) => !v)} active={open}>
          {action.label}
          <ChevronDown className="w-3 h-3" />
        </SecondaryButton>
        {open && <ChildMenu items={action.children} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div className="inline-flex items-stretch rounded-lg border border-gray-200 dark:border-gray-800">
        <button
          type="button"
          className="whitespace-nowrap rounded-l-lg px-3 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {action.label}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center rounded-r-lg border-l border-gray-200 dark:border-gray-800 px-1.5 transition-colors ${
            open
              ? "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
          }`}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      {open && <ChildMenu items={action.children} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ChildMenu({
  items,
  onClose,
}: {
  items: Action[];
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 py-1 shadow-lg"
      onMouseLeave={onClose}
    >
      {items.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-gray-400 dark:text-gray-500 italic">
          No children
        </div>
      ) : (
        items.map((child) => (
          <button
            key={child.key}
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            <span className="flex-1 truncate">{child.label}</span>
          </button>
        ))
      )}
    </div>
  );
}

function StartMenuSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="py-1">
      <div className="px-3 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function StartMenuItem({
  label,
  badge,
  mono,
  running,
  onClick,
}: {
  label: string;
  badge?: string;
  mono?: boolean;
  running?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          running
            ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
            : "bg-gray-300 dark:bg-gray-700"
        }`}
      />
      <span className={`flex-1 truncate ${mono ? "font-mono" : ""}`}>
        {label}
      </span>
      {badge && (
        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
          {badge}
        </span>
      )}
    </button>
  );
}

export function PlaygroundPreview({
  config,
  error,
}: {
  config: RawConfig | null;
  error: string | null;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [runningKeys, setRunningKeys] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("all");
  const startRef = useRef<HTMLDivElement>(null);

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

  const profileEntries = useMemo(
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

  const projectName = config?.name ?? "untitled";
  const hasAnyService = services.length > 0;
  const showStartSplit = services.length > 1;
  const runningServices = useMemo(
    () => services.filter((s) => runningKeys.has(s.key)),
    [services, runningKeys],
  );
  const effectiveRunning = runningServices.length > 0;
  const visibleServices =
    activeTab === "all" ||
    !runningServices.some((s) => s.key === activeTab)
      ? runningServices
      : runningServices.filter((s) => s.key === activeTab);

  const startAll = () => {
    setRunningKeys(new Set(services.map((s) => s.key)));
    setActiveTab("all");
    setStartOpen(false);
  };

  const stopAll = () => {
    setRunningKeys(new Set());
    setStartOpen(false);
  };

  const startProfile = (profileName: string) => {
    const entry = profileEntries.find(([k]) => k === profileName);
    const keys = entry
      ? entry[1].filter((name) => services.some((s) => s.key === name))
      : [];
    setRunningKeys(new Set(keys));
    setActiveTab("all");
    setStartOpen(false);
  };

  const toggleService = (key: string) => {
    setRunningKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setActiveTab("all");
    setStartOpen(false);
  };

  const handleStartStop = () => {
    if (effectiveRunning) stopAll();
    else startAll();
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {error && (
        <div className="flex-shrink-0 px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-950 text-[11px] text-red-700 dark:text-red-300 font-mono">
          {error}
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 pt-4 pb-6 min-h-0">
        <div className="flex items-center gap-4 py-1">
          <h1 className="shrink-0 text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            {projectName}
          </h1>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {plainActions.map((a) => (
              <SecondaryButton key={a.key}>{a.label}</SecondaryButton>
            ))}
            {buttonTerminals.map((t) => (
              <SecondaryButton key={t.key}>{t.label}</SecondaryButton>
            ))}
            {dropdownActions.map((a) => (
              <SplitButton key={a.key} action={a} />
            ))}

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStartOpen(false);
                  setMenuOpen((v) => !v);
                }}
                aria-label="Project actions"
                className={`flex items-center justify-center rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  menuOpen
                    ? "border-transparent bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
                    : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <MenuIcon className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1.5 min-w-[220px] max-w-[280px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {menuActions.length > 0 && (
                    <StartMenuSection label="Actions">
                      {menuActions.map((a) => (
                        <StartMenuItem key={a.key} label={a.label} />
                      ))}
                    </StartMenuSection>
                  )}
                  {menuTerminals.length > 0 && (
                    <StartMenuSection label="Terminals">
                      {menuTerminals.map((t) => (
                        <StartMenuItem key={t.key} label={t.label} />
                      ))}
                    </StartMenuSection>
                  )}
                  {menuActions.length === 0 && menuTerminals.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-gray-400 dark:text-gray-500 italic">
                      No menu items
                    </div>
                  )}
                </div>
              )}
            </div>

            {hasAnyService && (
              <div ref={startRef} className="relative flex shrink-0">
                <button
                  type="button"
                  onClick={handleStartStop}
                  className={`${
                    showStartSplit ? "rounded-l-lg" : "rounded-lg"
                  } px-3.5 py-1.5 text-[11px] font-medium transition-all hover:opacity-85 ${
                    effectiveRunning
                      ? "bg-red-500 text-white"
                      : "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  }`}
                >
                  {effectiveRunning ? "Stop" : "Start"}
                </button>
                {showStartSplit && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setStartOpen((v) => !v);
                    }}
                    className={`rounded-r-lg border-l px-1.5 py-1.5 transition-all hover:opacity-85 ${
                      effectiveRunning
                        ? "border-white/20 bg-red-500 text-white"
                        : "border-white/20 dark:border-gray-900/20 bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    }`}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                )}
                {showStartSplit && startOpen && (
                  <div
                    className="absolute right-0 top-full z-20 mt-1.5 min-w-[220px] max-w-[280px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl"
                    onMouseLeave={() => setStartOpen(false)}
                  >
                    {profileEntries.length > 0 && (
                      <>
                        <StartMenuSection label="Profiles">
                          {profileEntries.map(([name, keys]) => {
                            const resolved = keys.filter((k) =>
                              services.some((s) => s.key === k),
                            );
                            const isActive =
                              effectiveRunning &&
                              resolved.length === runningKeys.size &&
                              resolved.every((k) => runningKeys.has(k));
                            return (
                              <StartMenuItem
                                key={name}
                                label={name}
                                running={isActive}
                                onClick={() => startProfile(name)}
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
                          onClick={() => toggleService(s.key)}
                          badge={
                            typeof s.port === "number" ? `:${s.port}` : undefined
                          }
                        />
                      ))}
                    </StartMenuSection>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {effectiveRunning ? (
          <div className="mt-3 flex flex-1 min-h-0 flex-col rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
            <div className="flex-shrink-0 flex items-center gap-0 border-b border-gray-800 bg-gray-900/60 px-1 overflow-x-auto">
              {(services.length > 1
                ? ["all", ...runningServices.map((s) => s.key)]
                : runningServices.map((s) => s.key)
              ).map((tab) => {
                const active = tab === activeTab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-1.5 text-[11px] font-mono whitespace-nowrap border-b-2 transition-colors ${
                      active
                        ? "border-white text-white"
                        : "border-transparent text-gray-400 hover:text-gray-100"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 min-h-0 flex-row">
            {visibleServices.map((s, i) => (
              <div
                key={s.key}
                className={`flex-1 min-w-0 flex flex-col ${
                  i > 0 ? "border-l border-gray-800" : ""
                }`}
              >
                <div className="flex-shrink-0 flex items-center gap-1.5 border-b border-gray-800 bg-gray-900/60 px-2.5 py-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                  <span className="font-mono text-[11px] font-medium text-gray-100 truncate">
                    {s.key}
                  </span>
                  {typeof s.port === "number" && (
                    <span className="font-mono text-[10px] text-gray-500 flex-shrink-0">
                      :{s.port}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
                  <div className="text-emerald-400 break-all">
                    $ {s.cmd || "(no cmd)"}
                  </div>
                  <div className="text-gray-400 break-all">
                    [{projectName}] started {s.key}
                    {typeof s.port === "number" ? ` on port ${s.port}` : ""}
                  </div>
                  <div className="flex items-center text-gray-100">
                    <span className="text-gray-500 mr-1">&gt;</span>
                    <span className="inline-block w-[7px] h-3.5 bg-gray-100 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-1 min-h-0 flex-col items-center justify-center">
            <div className="flex max-w-sm flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-600">
                <Terminal className="w-5 h-5" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <h3 className="text-xs font-medium text-gray-900 dark:text-white">
                  No active terminals
                </h3>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  {hasAnyService
                    ? `Click Start to run ${projectName}, or open a terminal.`
                    : `Add a service in the config to get started.`}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
