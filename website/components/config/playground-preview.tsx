"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Menu as MenuIcon,
  Pencil,
  RotateCcw,
  Settings,
  Terminal,
  Trash2,
} from "lucide-react";

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
  cwd?: string;
  env?: Record<string, string>;
  confirm?: boolean;
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
    cwd: def?.cwd,
    env: def?.env,
    confirm: def?.confirm,
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

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

type ModalPhase = "idle" | "running" | "result";

function ActionModal({
  action,
  initialPhase = "idle",
  onClose,
}: {
  action: Action;
  initialPhase?: ModalPhase;
  onClose: () => void;
}) {
  const destructive = action.confirm === true;
  const [phase, setPhase] = useState<ModalPhase>(initialPhase);
  const [duration, setDuration] = useState<number | null>(null);

  useEffect(() => {
    if (phase !== "running") return;
    const start = performance.now();
    const id = window.setTimeout(() => {
      setDuration(Math.round(performance.now() - start));
      setPhase("result");
    }, 650);
    return () => window.clearTimeout(id);
  }, [phase]);

  const handleRun = () => {
    if (phase !== "idle") return;
    setPhase("running");
  };

  const isBusy = phase === "running";

  if (phase === "idle") {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 bg-black/30 dark:bg-black/60"
        />
        <div className="relative w-72 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-5 shadow-xl">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Run{" "}
            <span className="font-medium text-gray-900 dark:text-white">
              {action.label}
            </span>
            ?
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRun}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90 ${
                destructive
                  ? "bg-red-500 text-white"
                  : "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              }`}
            >
              Run
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title =
    phase === "result" ? `${action.label} finished` : `Running ${action.label}`;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={isBusy ? undefined : onClose}
        className="absolute inset-0 bg-black/30 dark:bg-black/60"
      />
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-6 shadow-xl">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          {phase === "result" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="w-3 h-3" />
              success
            </span>
          )}
        </div>
        {phase === "running" && (
          <div className="mt-4 rounded-lg bg-gray-950 px-3 py-3 font-mono text-xs text-gray-100 leading-relaxed">
            <div className="text-emerald-400">$ {action.cmd || "(no cmd)"}</div>
            <div className="mt-1 flex items-center gap-2 text-gray-400">
              <Spinner className="w-3 h-3" />
              <span>Running…</span>
            </div>
          </div>
        )}

        {phase === "result" && (
          <div className="mt-4 rounded-lg bg-gray-950 px-3 py-3 font-mono text-xs text-gray-100 leading-relaxed">
            <div className="text-emerald-400">$ {action.cmd || "(no cmd)"}</div>
            <div className="text-gray-400">
              {action.label} completed without errors.
            </div>
            <div className="text-gray-500 mt-2 flex items-center justify-between">
              <span>exit code 0</span>
              {duration !== null && <span>{duration}ms</span>}
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-all hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed min-w-[92px] bg-gray-900 text-white dark:bg-white dark:text-gray-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
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
      className={`shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SplitButton({
  action,
  onRun,
}: {
  action: Action;
  onRun: (a: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasCmd = !!action.cmd;

  const runChild = (child: Action) => {
    setOpen(false);
    onRun(child);
  };

  if (!hasCmd) {
    return (
      <div className="relative shrink-0">
        <SecondaryButton onClick={() => setOpen((v) => !v)} active={open}>
          {action.label}
          <ChevronDown className="w-3 h-3" />
        </SecondaryButton>
        {open && (
          <ChildMenu
            items={action.children}
            onRun={runChild}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div className="inline-flex items-stretch rounded-lg border border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => onRun(action)}
          className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white transition-colors"
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
      {open && (
        <ChildMenu
          items={action.children}
          onRun={runChild}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ChildMenu({
  items,
  onRun,
  onClose,
}: {
  items: Action[];
  onRun: (a: Action) => void;
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
            onClick={() => onRun(child)}
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
  subtext,
  badge,
  mono,
  running,
  showDot = true,
  showCheck,
  icon,
  shortcut,
  onClick,
}: {
  label: string;
  subtext?: string;
  badge?: string;
  mono?: boolean;
  running?: boolean;
  showDot?: boolean;
  showCheck?: boolean;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
    >
      {icon ? (
        <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">
          {icon}
        </span>
      ) : showDot ? (
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
            running
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
              : "border border-gray-300 dark:border-gray-700"
          }`}
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate ${mono ? "font-mono" : ""}`}>{label}</span>
        {subtext && (
          <span className="truncate text-[10px] text-gray-400 dark:text-gray-500 font-mono">
            {subtext}
          </span>
        )}
      </span>
      {showCheck && (
        <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
      )}
      {shortcut && (
        <span className="font-mono text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
          {shortcut}
        </span>
      )}
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
  const [openTerminalKeys, setOpenTerminalKeys] = useState<Set<string>>(
    new Set(),
  );
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedAction, setSelectedAction] = useState<{
    action: Action;
    initialPhase: ModalPhase;
  } | null>(null);
  const startRef = useRef<HTMLDivElement>(null);

  const toggleTerminal = (key: string) => {
    setMenuOpen(false);
    setOpenTerminalKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setActiveTab("all");
  };

  const openAction = (action: Action) => {
    setMenuOpen(false);
    setStartOpen(false);
    setSelectedAction({
      action,
      initialPhase: action.confirm ? "idle" : "running",
    });
  };

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

  const projectName = config?.name ?? "";
  const hasAnyService = services.length > 0;
  const showStartSplit = services.length > 1;
  const runningServices = useMemo(
    () => services.filter((s) => runningKeys.has(s.key)),
    [services, runningKeys],
  );
  const openTerminals = useMemo(
    () => terminals.filter((t) => openTerminalKeys.has(t.key)),
    [terminals, openTerminalKeys],
  );
  const effectiveRunning = runningServices.length > 0;
  const hasAnyPane = effectiveRunning || openTerminals.length > 0;

  type Pane =
    | { type: "service"; id: string; key: string; label: string; cmd: string }
    | { type: "terminal"; id: string; key: string; label: string; cmd: string };

  const panes: Pane[] = useMemo(() => {
    const svc: Pane[] = runningServices.map((s) => ({
      type: "service",
      id: `s:${s.key}`,
      key: s.key,
      label: s.key,
      cmd: s.cmd,
    }));
    const term: Pane[] = openTerminals.map((t) => ({
      type: "terminal",
      id: `t:${t.key}`,
      key: t.key,
      label: t.label,
      cmd:
        typeof config?.terminals?.[t.key] === "string"
          ? (config.terminals[t.key] as string)
          : ((config?.terminals?.[t.key] as { cmd?: string } | undefined)?.cmd ??
            ""),
    }));
    return [...svc, ...term];
  }, [runningServices, openTerminals, config]);

  const showAllTab = panes.length > 1;
  const visiblePanes =
    activeTab === "all" || !panes.some((p) => p.id === activeTab)
      ? panes
      : panes.filter((p) => p.id === activeTab);

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
    <div className="relative h-full flex flex-col bg-white dark:bg-gray-950">
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
              <SecondaryButton key={a.key} onClick={() => openAction(a)}>
                {a.label}
              </SecondaryButton>
            ))}
            {buttonTerminals.map((t) => (
              <SecondaryButton
                key={t.key}
                onClick={() => toggleTerminal(t.key)}
                active={openTerminalKeys.has(t.key)}
              >
                {t.label}
              </SecondaryButton>
            ))}
            {dropdownActions.map((a) => (
              <SplitButton key={a.key} action={a} onRun={openAction} />
            ))}

            {(menuActions.length > 0 || menuTerminals.length > 0) && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStartOpen(false);
                  setMenuOpen((v) => !v);
                }}
                aria-label="Project actions"
                className={`flex items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  menuOpen
                    ? "border-transparent bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
                    : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <MenuIcon className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-20 mt-1.5 min-w-[240px] max-w-[300px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {menuActions.length > 0 && (
                    <StartMenuSection label="Actions">
                      {menuActions.map((a) => (
                        <StartMenuItem
                          key={a.key}
                          label={a.label}
                          showDot={false}
                          icon={<Terminal className="w-3 h-3" />}
                          onClick={() => openAction(a)}
                        />
                      ))}
                    </StartMenuSection>
                  )}
                  {menuTerminals.length > 0 && (
                    <StartMenuSection label="Terminals">
                      {menuTerminals.map((t) => (
                        <StartMenuItem
                          key={t.key}
                          label={t.label}
                          showDot={false}
                          icon={<Terminal className="w-3 h-3" />}
                          showCheck={openTerminalKeys.has(t.key)}
                          onClick={() => toggleTerminal(t.key)}
                        />
                      ))}
                    </StartMenuSection>
                  )}
                  {(menuActions.length > 0 || menuTerminals.length > 0) && (
                    <div className="mx-3 border-t border-gray-200 dark:border-gray-800" />
                  )}
                  <StartMenuSection label="Project">
                    <StartMenuItem
                      label="Edit Config"
                      showDot={false}
                      icon={<Pencil className="w-3 h-3" />}
                      shortcut="⌘E"
                    />
                    {effectiveRunning && (
                      <StartMenuItem
                        label="Restart"
                        showDot={false}
                        icon={<RotateCcw className="w-3 h-3" />}
                      />
                    )}
                    <StartMenuItem
                      label="Terminal Settings"
                      showDot={false}
                      icon={<Settings className="w-3 h-3" />}
                    />
                    <StartMenuItem
                      label="Remove"
                      showDot={false}
                      icon={<Trash2 className="w-3 h-3" />}
                    />
                  </StartMenuSection>
                </div>
              )}
            </div>
            )}

            {hasAnyService && (
              <div ref={startRef} className="relative flex shrink-0">
                <button
                  type="button"
                  onClick={handleStartStop}
                  className={`${
                    showStartSplit ? "rounded-l-lg" : "rounded-lg"
                  } px-3.5 py-1.5 text-xs font-medium transition-all hover:opacity-85 ${
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
                    className="absolute right-0 top-full z-20 mt-1.5 min-w-[240px] max-w-[300px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-xl"
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
                                subtext={resolved.join(" · ")}
                                running={isActive}
                                showCheck={isActive}
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
                        />
                      ))}
                    </StartMenuSection>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {hasAnyPane ? (
          <div className="mt-3 flex flex-1 min-h-0 flex-col rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden bg-gray-950">
            {panes.length > 1 && (
              <div className="flex-shrink-0 flex items-center gap-0 border-b border-gray-800 bg-gray-900/60 px-1 overflow-x-auto">
                {(showAllTab ? ["all", ...panes.map((p) => p.id)] : panes.map((p) => p.id)).map(
                  (tabId) => {
                    const active = tabId === activeTab;
                    const label =
                      tabId === "all"
                        ? "all"
                        : panes.find((p) => p.id === tabId)?.label ?? tabId;
                    return (
                      <button
                        key={tabId}
                        type="button"
                        onClick={() => setActiveTab(tabId)}
                        className={`px-2.5 py-1.5 text-[11px] font-mono whitespace-nowrap border-b-2 transition-colors ${
                          active
                            ? "border-white text-white"
                            : "border-transparent text-gray-400 hover:text-gray-100"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </div>
            )}
            <div className="flex flex-1 min-h-0 flex-row">
              {visiblePanes.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex-1 min-w-0 flex flex-col ${
                    i > 0 ? "border-l border-gray-800" : ""
                  }`}
                >
                  <div className="flex-shrink-0 flex items-center gap-1.5 border-b border-gray-800 bg-gray-900/60 px-2.5 py-1.5">
                    {p.type === "service" ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                    ) : (
                      <Terminal className="w-3 h-3 text-gray-400" />
                    )}
                    <span className="font-mono text-[11px] font-medium text-gray-100 truncate flex-1">
                      {p.label}
                    </span>
                    {p.type === "terminal" && (
                      <button
                        type="button"
                        onClick={() => toggleTerminal(p.key)}
                        aria-label={`Close ${p.label}`}
                        className="text-gray-500 hover:text-gray-100 transition-colors flex-shrink-0 leading-none text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-100">
                    <div className="text-emerald-400 break-all">
                      $ {p.cmd || "(no cmd)"}
                    </div>
                    {p.type === "service" && (
                      <div className="text-gray-400 break-all">
                        [{projectName}] started {p.key}
                      </div>
                    )}
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
