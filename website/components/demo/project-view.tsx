"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Menu as MenuIcon, Terminal } from "lucide-react";
import type { DemoAction, DemoProject, DemoService } from "./projects";
import { PaneHeader, StreamingOutput } from "./terminal-pane";
import { DemoActionModal } from "./action-modal";

type PaneId =
  | { kind: "service"; name: string }
  | { kind: "shell" }
  | { kind: "action"; key: string; label: string };

type ActionTerminal = { key: string; action: DemoAction };

const ALL_TAB = "__all__";
const MAX_TERMINAL_HISTORY = 200;
const MAX_ACTION_TERMINALS = 4;

const paneKey = (id: PaneId): string =>
  id.kind === "service"
    ? `s:${id.name}`
    : id.kind === "shell"
      ? "t:shell"
      : `a:${id.key}`;

const paneLabel = (id: PaneId): string =>
  id.kind === "service" ? id.name : id.kind === "shell" ? "terminal" : id.label;

type ProjectViewProps = {
  project: DemoProject;
  runningServices: Set<string>;
  onStartServices: (names: string[]) => void;
  onStopAll: () => void;
  onToggleService: (name: string) => void;
};

export function DemoProjectView({
  project,
  runningServices,
  onStartServices,
  onStopAll,
  onToggleService,
}: ProjectViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [runningAction, setRunningAction] = useState<DemoAction | null>(null);
  const [openShell, setOpenShell] = useState(false);
  const [actionTerminals, setActionTerminals] = useState<ActionTerminal[]>([]);

  const panes = useMemo<PaneId[]>(() => {
    const out: PaneId[] = project.services
      .filter((s) => runningServices.has(s.name))
      .map((s) => ({ kind: "service", name: s.name }));
    if (openShell) out.push({ kind: "shell" });
    for (const at of actionTerminals) {
      out.push({ kind: "action", key: at.key, label: at.action.label });
    }
    return out;
  }, [project.services, runningServices, openShell, actionTerminals]);

  const anyRunning = panes.some((p) => p.kind === "service");
  const hasPane = panes.length > 0;
  const buttonActions = project.actions.filter((a) => a.display === "button");
  const menuActions = project.actions.filter((a) => a.display !== "button");

  const showAllTab = panes.length > 1;
  const knownKeys = panes.map(paneKey);
  const showingAll = activeTab === ALL_TAB || !knownKeys.includes(activeTab);
  const visiblePanes = showingAll
    ? panes
    : panes.filter((p) => paneKey(p) === activeTab);

  const handleStartStop = () => {
    if (anyRunning) {
      onStopAll();
    } else {
      const defaultProfile = project.profiles.find((p) => p.name === "default");
      onStartServices(
        defaultProfile
          ? defaultProfile.services
          : project.services.map((s) => s.name),
      );
    }
    setActiveTab(ALL_TAB);
  };

  return (
    <div className="relative flex flex-1 min-w-0 flex-col bg-[#1a1a1a]">
      <Header
        project={project}
        anyRunning={anyRunning}
        buttonActions={buttonActions}
        menuActions={menuActions}
        menuOpen={menuOpen}
        startOpen={startOpen}
        onToggleMenu={() => {
          setStartOpen(false);
          setMenuOpen((v) => !v);
        }}
        onToggleStart={() => {
          setMenuOpen(false);
          setStartOpen((v) => !v);
        }}
        onCloseStart={() => setStartOpen(false)}
        onCloseMenu={() => setMenuOpen(false)}
        onStartStop={handleStartStop}
        onStartProfile={(profile) => {
          const p = project.profiles.find((x) => x.name === profile);
          if (p) onStartServices(p.services);
          setStartOpen(false);
          setActiveTab(ALL_TAB);
        }}
        onToggleService={(name) => {
          onToggleService(name);
          setActiveTab(ALL_TAB);
        }}
        onOpenAction={(a) => {
          setMenuOpen(false);
          if (a.type === "terminal") {
            setActionTerminals((prev) => {
              const next = [...prev, { key: `${a.name}-${Date.now()}`, action: a }];
              return next.length > MAX_ACTION_TERMINALS
                ? next.slice(-MAX_ACTION_TERMINALS)
                : next;
            });
            setActiveTab(ALL_TAB);
          } else {
            setRunningAction(a);
          }
        }}
        runningServices={runningServices}
        onOpenTerminal={() => {
          setOpenShell(true);
          setActiveTab(ALL_TAB);
        }}
      />

      {hasPane ? (
        <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden border-t border-[#2e2e2e]">
          {showAllTab && (
            <TabBar
              panes={panes}
              active={activeTab}
              onChange={setActiveTab}
            />
          )}
          <div className="flex flex-1 min-h-0 flex-row">
            {visiblePanes.map((pane, i) => (
              <PaneColumn key={paneKey(pane)} first={i === 0}>
                {renderPane(
                  pane,
                  project,
                  runningServices,
                  actionTerminals,
                  () => setOpenShell(false),
                  (key) =>
                    setActionTerminals((prev) =>
                      prev.filter((t) => t.key !== key),
                    ),
                )}
              </PaneColumn>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          projectName={project.name}
          onOpenTerminal={() => setOpenShell(true)}
        />
      )}

      {runningAction && (
        <DemoActionModal
          action={runningAction}
          onClose={() => setRunningAction(null)}
        />
      )}
    </div>
  );
}

function renderPane(
  pane: PaneId,
  project: DemoProject,
  runningServices: Set<string>,
  actionTerminals: ActionTerminal[],
  onCloseShell: () => void,
  onCloseAction: (key: string) => void,
): ReactNode {
  if (pane.kind === "service") {
    const svc = project.services.find((s) => s.name === pane.name);
    if (!svc) return null;
    return (
      <>
        <PaneHeader
          label={svc.name}
          port={svc.port}
          type="service"
          running={runningServices.has(svc.name)}
        />
        <StreamingOutput
          key={`${project.name}:${svc.name}`}
          output={svc.output}
          loop={svc.loop}
        />
      </>
    );
  }
  if (pane.kind === "shell") {
    return (
      <>
        <PaneHeader
          label="terminal"
          type="terminal"
          running
          onClose={onCloseShell}
        />
        <InteractiveTerminal projectRoot={project.root} />
      </>
    );
  }
  const at = actionTerminals.find((t) => t.key === pane.key);
  if (!at) return null;
  return (
    <>
      <PaneHeader
        label={at.action.label}
        type="terminal"
        running
        onClose={() => onCloseAction(pane.key)}
      />
      <StreamingOutput
        key={pane.key}
        output={at.action.output}
        loop={at.action.loop}
      />
    </>
  );
}

function PaneColumn({
  first,
  children,
}: {
  first: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex-1 min-w-0 flex flex-col ${
        first ? "" : "border-l border-[#2d2d2d]"
      }`}
    >
      {children}
    </div>
  );
}

function TabBar({
  panes,
  active,
  onChange,
}: {
  panes: PaneId[];
  active: string;
  onChange: (id: string) => void;
}) {
  const tabs: { id: string; label: string }[] = [
    { id: ALL_TAB, label: "all" },
    ...panes.map((p) => ({ id: paneKey(p), label: paneLabel(p) })),
  ];
  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 border-b border-white/5 bg-[#2d2d2d] px-1.5 py-1 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex items-center rounded-md px-2.5 py-1 font-mono text-[11px] font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-white/10 text-gray-100"
                : "text-gray-400 hover:text-gray-100"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({
  projectName,
  onOpenTerminal,
}: {
  projectName: string;
  onOpenTerminal: () => void;
}) {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#2e2e2e] bg-[#242424] text-[#919191]">
          <Terminal className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-sm font-medium text-[#e5e5e5]">
            No active terminals
          </h3>
          <p className="text-xs text-[#919191] leading-relaxed">
            Click Start to run {projectName}, or open a terminal.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTerminal}
          className="flex items-center gap-2 rounded-lg border border-[#2e2e2e] bg-[#242424] px-3.5 py-1.5 text-xs font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
          New Terminal
        </button>
      </div>
    </div>
  );
}

function InteractiveTerminal({ projectRoot }: { projectRoot: string }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<
    { prompt: string; input: string; output: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = `~/${projectRoot.replace(/^~\//, "")} $ `;

  const fakeRun = (cmd: string): string => {
    const trimmed = cmd.trim();
    if (!trimmed) return "";
    if (trimmed === "ls") {
      return "README.md  package.json  src/  scripts/  tests/";
    }
    if (trimmed === "pwd") return projectRoot;
    if (trimmed === "git status") {
      return [
        "On branch main",
        "Your branch is up to date with 'origin/main'.",
        "",
        "nothing to commit, working tree clean",
      ].join("\n");
    }
    if (trimmed === "git log --oneline -3") {
      return [
        "aa990a3 refactor build: remove goreleaser config",
        "5068101 chore(release): notarized macOS binaries",
        "1caaf7f feat(vite): bump target to ES2022",
      ].join("\n");
    }
    if (trimmed === "whoami") return "demo";
    if (trimmed === "date") return "Thu Apr 23 09:01:42 UTC 2026";
    if (trimmed === "clear") return "__clear__";
    if (trimmed.startsWith("echo ")) return trimmed.slice(5);
    if (trimmed === "help") {
      return [
        "demo shell · try:",
        "  ls          list files",
        "  git status  working tree status",
        "  whoami      current user",
        "  echo X      print X",
        "  clear       clear terminal",
      ].join("\n");
    }
    return `zsh: command not found: ${trimmed.split(" ")[0]}`;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const out = fakeRun(input);
    if (out === "__clear__") {
      setHistory([]);
    } else {
      setHistory((h) => {
        const next = [...h, { prompt, input, output: out }];
        return next.length > MAX_TERMINAL_HISTORY
          ? next.slice(-MAX_TERMINAL_HISTORY)
          : next;
      });
    }
    setInput("");
  };

  return (
    <div
      className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed bg-[#1a1a1a]"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="text-gray-400">
        lpm demo · try{" "}
        <span className="text-emerald-400">ls</span>,{" "}
        <span className="text-emerald-400">git status</span>,{" "}
        <span className="text-emerald-400">help</span>
      </div>
      {history.map((h, i) => (
        <div key={i}>
          <div className="text-gray-100 whitespace-pre-wrap break-all">
            <span className="text-cyan-300">{h.prompt}</span>
            {h.input}
          </div>
          {h.output && (
            <div className="text-gray-300 whitespace-pre-wrap">{h.output}</div>
          )}
        </div>
      ))}
      <form onSubmit={onSubmit} className="flex items-center text-gray-100">
        <span className="text-cyan-300 whitespace-pre">{prompt}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="flex-1 bg-transparent outline-none text-gray-100 font-mono caret-gray-100"
        />
      </form>
    </div>
  );
}

function DropdownSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#919191]">
      {children}
    </div>
  );
}

type HeaderProps = {
  project: DemoProject;
  anyRunning: boolean;
  buttonActions: DemoAction[];
  menuActions: DemoAction[];
  menuOpen: boolean;
  startOpen: boolean;
  runningServices: Set<string>;
  onToggleMenu: () => void;
  onToggleStart: () => void;
  onCloseStart: () => void;
  onCloseMenu: () => void;
  onStartStop: () => void;
  onStartProfile: (name: string) => void;
  onToggleService: (name: string) => void;
  onOpenAction: (a: DemoAction) => void;
  onOpenTerminal: () => void;
};

function Header({
  project,
  anyRunning,
  buttonActions,
  menuActions,
  menuOpen,
  startOpen,
  runningServices,
  onToggleMenu,
  onToggleStart,
  onCloseStart,
  onCloseMenu,
  onStartStop,
  onStartProfile,
  onToggleService,
  onOpenAction,
  onOpenTerminal,
}: HeaderProps) {
  const showSplit = project.services.length > 1 || project.profiles.length > 1;
  const startColor = anyRunning
    ? "bg-red-500 text-white"
    : "bg-white text-gray-900";
  const startChevronBorder = anyRunning
    ? "border-white/20 bg-red-500 text-white"
    : "border-gray-900/20 bg-white text-gray-900";
  return (
    <div className="flex items-center gap-3 px-4 h-12 shrink-0">
      <div className="flex flex-col min-w-0">
        <h1 className="truncate text-base font-semibold text-[#e5e5e5]">
          {project.label ?? project.name}
        </h1>
        <span className="text-[10px] text-[#919191] truncate">
          {project.stack}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        {buttonActions.map((a) => (
          <button
            key={a.name}
            type="button"
            onClick={() => onOpenAction(a)}
            className="rounded-lg border border-[#2e2e2e] bg-[#242424] px-2.5 py-1.5 text-xs font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] transition-colors"
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={onOpenTerminal}
          title="Open terminal"
          className="rounded-lg border border-[#2e2e2e] bg-[#242424] px-2 py-1.5 text-xs font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] transition-colors"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        {menuActions.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={onToggleMenu}
              aria-label="More actions"
              className={`flex items-center justify-center rounded-lg border px-2 py-1.5 transition-colors ${
                menuOpen
                  ? "border-transparent bg-[#333333] text-[#e5e5e5]"
                  : "border-[#2e2e2e] bg-[#242424] text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              }`}
            >
              <MenuIcon className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-[#2e2e2e] bg-[#242424] py-1 shadow-xl"
                onMouseLeave={onCloseMenu}
              >
                <DropdownSectionLabel>Actions</DropdownSectionLabel>
                {menuActions.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    onClick={() => onOpenAction(a)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-mono text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
                  >
                    <Terminal className="w-3 h-3 shrink-0 text-[#919191]" />
                    <span className="truncate">{a.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="relative flex shrink-0">
          <button
            type="button"
            onClick={onStartStop}
            className={`${showSplit ? "rounded-l-lg" : "rounded-lg"} px-3.5 py-1.5 text-xs font-medium transition-all hover:opacity-85 ${startColor}`}
          >
            {anyRunning ? "Stop" : "Start"}
          </button>
          {showSplit && (
            <button
              type="button"
              onClick={onToggleStart}
              className={`rounded-r-lg border-l px-1.5 py-1.5 transition-all hover:opacity-85 ${startChevronBorder}`}
            >
              <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
          {showSplit && startOpen && (
            <div
              className="absolute right-0 top-full z-40 mt-1.5 min-w-[240px] overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#242424] shadow-xl"
              onMouseLeave={onCloseStart}
            >
              {project.profiles.length > 0 && (
                <>
                  <DropdownSectionLabel>Profiles</DropdownSectionLabel>
                  {project.profiles.map((p) => {
                    const isActive =
                      runningServices.size > 0 &&
                      p.services.length === runningServices.size &&
                      p.services.every((s) => runningServices.has(s));
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => onStartProfile(p.name)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
                      >
                        <span className="mt-[5px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12px]">{p.name}</span>
                          <span className="truncate text-[10px] text-[#919191] font-mono">
                            {p.services.join(" · ")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <div className="mx-3 border-t border-[#2e2e2e]" />
                </>
              )}
              <DropdownSectionLabel>Services</DropdownSectionLabel>
              <div className="pb-1.5">
                {project.services.map((s) => (
                  <ServiceMenuItem
                    key={s.name}
                    service={s}
                    running={runningServices.has(s.name)}
                    onClick={() => onToggleService(s.name)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceMenuItem({
  service,
  running,
  onClick,
}: {
  service: DemoService;
  running: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-[#2a2a2a] ${
        running ? "text-[#e5e5e5] font-medium" : "text-[#b3b3b3]"
      }`}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
        {running && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      </span>
      <span className="flex-1 truncate font-mono">{service.name}</span>
      {service.port !== undefined && (
        <span className="text-[10px] text-[#919191] tabular-nums">
          :{service.port}
        </span>
      )}
    </button>
  );
}
