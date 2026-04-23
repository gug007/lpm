"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  Menu as MenuIcon,
  Plus,
  Terminal,
} from "lucide-react";
import type { DemoAction, DemoProject, DemoService } from "./projects";
import { PaneHeader, StreamingOutput } from "./terminal-pane";
import { DemoActionModal } from "./action-modal";
import { AgentTerminal } from "./agent-terminal";
import {
  type PaneLeaf,
  type PaneNode,
  type PaneSplit,
  type SplitDirection,
  appendLeaf,
  collectLeaves,
  collectServiceNames,
  findLeaf,
  makeLeaf,
  removeLeaf,
  setRatioAtPath,
  splitAtLeaf,
} from "./pane-tree";

const MAX_TERMINAL_HISTORY = 200;

type ActionTerminalMap = Record<string, DemoAction>;

type ProjectViewProps = {
  project: DemoProject;
  runningServices: Set<string>;
  onStartServices: (names: string[]) => void;
  onStopAll: () => void;
  onToggleService: (name: string) => void;
};

function reconcileServices(
  tree: PaneNode | null,
  running: Set<string>,
): PaneNode | null {
  let t = tree;
  for (const leaf of collectLeaves(t)) {
    if (leaf.content.kind === "service" && !running.has(leaf.content.name)) {
      t = t ? removeLeaf(t, leaf.id) : null;
    }
  }
  const existing = new Set(collectServiceNames(t));
  for (const name of running) {
    if (!existing.has(name)) {
      const leaf = makeLeaf({ kind: "service", name });
      t = t
        ? { kind: "split", direction: "row", ratio: 0.5, a: leaf, b: t }
        : leaf;
    }
  }
  return t;
}

export function DemoProjectView({
  project,
  runningServices,
  onStartServices,
  onStopAll,
  onToggleService,
}: ProjectViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [runningAction, setRunningAction] = useState<DemoAction | null>(null);
  const [tree, setTree] = useState<PaneNode | null>(null);
  const [actionTerminals, setActionTerminals] = useState<ActionTerminalMap>({});
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState<SplitDirection>("row");

  useEffect(() => {
    if (!isResizing) return;
    const body = document.body;
    const prevCursor = body.style.cursor;
    const prevSelect = body.style.userSelect;
    body.style.cursor = resizeDir === "row" ? "col-resize" : "row-resize";
    body.style.userSelect = "none";
    return () => {
      body.style.cursor = prevCursor;
      body.style.userSelect = prevSelect;
    };
  }, [isResizing, resizeDir]);

  const anyRunning = runningServices.size > 0;
  const buttonActions = project.actions.filter((a) => a.display === "button");
  const menuActions = project.actions.filter((a) => a.display !== "button");

  const openNewShell = () => {
    setTree((prev) => appendLeaf(prev, makeLeaf({ kind: "shell" })));
  };

  const openActionTerminal = (action: DemoAction) => {
    const key = `${action.name}-${Date.now().toString(36)}`;
    setActionTerminals((prev) => ({ ...prev, [key]: action }));
    setTree((prev) =>
      appendLeaf(prev, makeLeaf({ kind: "action", key, label: action.label })),
    );
  };

  const handleSplit = (paneId: string, direction: SplitDirection) => {
    setTree((prev) =>
      prev ? splitAtLeaf(prev, paneId, direction, makeLeaf({ kind: "shell" })) : prev,
    );
  };

  const handleClose = (paneId: string) => {
    if (!tree) return;
    const leaf = findLeaf(tree, paneId);
    if (!leaf) return;
    if (leaf.content.kind === "service") {
      onToggleService(leaf.content.name);
      setTree(removeLeaf(tree, paneId));
      return;
    }
    if (leaf.content.kind === "action") {
      const key = leaf.content.key;
      setActionTerminals((map) => {
        if (!(key in map)) return map;
        const next = { ...map };
        delete next[key];
        return next;
      });
    }
    setTree(removeLeaf(tree, paneId));
  };

  const handleRatioChange = useCallback(
    (path: number[], ratio: number) => {
      setTree((prev) => (prev ? setRatioAtPath(prev, path, ratio) : prev));
    },
    [],
  );

  const handleResizeStart = useCallback((dir: SplitDirection) => {
    setResizeDir(dir);
    setIsResizing(true);
  }, []);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  const applyServicesToTree = (names: string[]) => {
    setTree((prev) => reconcileServices(prev, new Set(names)));
  };

  const handleStartStop = () => {
    if (anyRunning) {
      onStopAll();
      applyServicesToTree([]);
    } else {
      const defaultProfile = project.profiles.find((p) => p.name === "default");
      const names = defaultProfile
        ? defaultProfile.services
        : project.services.map((s) => s.name);
      onStartServices(names);
      applyServicesToTree(names);
    }
  };

  const handleToggleService = (name: string) => {
    onToggleService(name);
    const next = new Set(runningServices);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    applyServicesToTree([...next]);
  };

  const handleStartProfile = (profile: string) => {
    const p = project.profiles.find((x) => x.name === profile);
    if (!p) return;
    onStartServices(p.services);
    applyServicesToTree(p.services);
    setStartOpen(false);
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
        onStartProfile={handleStartProfile}
        onToggleService={handleToggleService}
        onOpenAction={(a) => {
          setMenuOpen(false);
          if (a.type === "terminal") {
            openActionTerminal(a);
          } else {
            setRunningAction(a);
          }
        }}
        runningServices={runningServices}
        onOpenTerminal={openNewShell}
      />

      {tree ? (
        <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden border-t border-[#2e2e2e]">
          <PaneLayout
            node={tree}
            path={[]}
            project={project}
            runningServices={runningServices}
            actionTerminals={actionTerminals}
            onSplit={handleSplit}
            onClose={handleClose}
            onRatioChange={handleRatioChange}
            onResizeStart={handleResizeStart}
            onResizeEnd={handleResizeEnd}
          />
        </div>
      ) : (
        <EmptyState projectName={project.name} onOpenTerminal={openNewShell} />
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

type PaneLayoutProps = {
  node: PaneNode;
  path: number[];
  project: DemoProject;
  runningServices: Set<string>;
  actionTerminals: ActionTerminalMap;
  onSplit: (paneId: string, direction: SplitDirection) => void;
  onClose: (paneId: string) => void;
  onRatioChange: (path: number[], ratio: number) => void;
  onResizeStart: (dir: SplitDirection) => void;
  onResizeEnd: () => void;
};

function PaneLayout(props: PaneLayoutProps) {
  if (props.node.kind === "leaf") return <Leaf {...props} leaf={props.node} />;
  return <SplitView {...props} split={props.node} />;
}

function Leaf({
  leaf,
  project,
  runningServices,
  actionTerminals,
  onSplit,
  onClose,
}: PaneLayoutProps & { leaf: PaneLeaf }) {
  const splitProps = {
    onSplitRight: () => onSplit(leaf.id, "row"),
    onSplitDown: () => onSplit(leaf.id, "col"),
    onClose: () => onClose(leaf.id),
  };
  const content = leaf.content;
  if (content.kind === "service") {
    const svc = project.services.find((s) => s.name === content.name);
    if (!svc) return null;
    return (
      <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        <PaneHeader
          label={svc.name}
          port={svc.port}
          type="service"
          running={runningServices.has(svc.name)}
          {...splitProps}
        />
        <StreamingOutput
          key={`${project.name}:${svc.name}`}
          output={svc.output}
          loop={svc.loop}
        />
      </div>
    );
  }
  if (content.kind === "shell") {
    return (
      <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        <PaneHeader label="terminal" type="terminal" running {...splitProps} />
        <InteractiveTerminal key={leaf.id} projectRoot={project.root} />
      </div>
    );
  }
  const action = actionTerminals[content.key];
  if (!action) return null;
  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
      <PaneHeader
        label={action.label}
        type="terminal"
        running
        {...splitProps}
      />
      {action.agent ? (
        <AgentTerminal
          key={content.key}
          agent={action.agent}
          cwd={project.root}
        />
      ) : (
        <StreamingOutput
          key={content.key}
          output={action.output}
          loop={action.loop}
        />
      )}
    </div>
  );
}

function SplitView(
  props: PaneLayoutProps & { split: PaneSplit },
) {
  const { split, path, onRatioChange, onResizeStart, onResizeEnd } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isRow = split.direction === "row";

  const onDividerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const total = isRow ? rect.width : rect.height;
      if (total <= 0) return;
      const origin = isRow ? rect.left : rect.top;

      let rafId = 0;
      let pendingPos = 0;
      const onMove = (ev: MouseEvent) => {
        pendingPos = isRow ? ev.clientX : ev.clientY;
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          onRatioChange(path, (pendingPos - origin) / total);
        });
      };
      const onUp = () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        onResizeEnd();
      };
      onResizeStart(split.direction);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isRow, path, split.direction, onRatioChange, onResizeStart, onResizeEnd],
  );

  const dim = isRow ? "width" : "height";
  const aStyle = { [dim]: `${split.ratio * 100}%` } as React.CSSProperties;
  const bStyle = { [dim]: `${(1 - split.ratio) * 100}%` } as React.CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`flex flex-1 min-w-0 min-h-0 overflow-hidden ${
        isRow ? "flex-row" : "flex-col"
      }`}
    >
      <div
        className="flex min-w-0 min-h-0 overflow-hidden"
        style={aStyle}
      >
        <PaneLayout {...props} node={split.a} path={[...path, 0]} />
      </div>
      <div
        onMouseDown={onDividerDown}
        className={`shrink-0 bg-[#2d2d2d] hover:bg-[#4a4a4a] transition-colors ${
          isRow ? "w-[3px] cursor-col-resize" : "h-[3px] cursor-row-resize"
        }`}
      />
      <div
        className="flex min-w-0 min-h-0 overflow-hidden"
        style={bStyle}
      >
        <PaneLayout {...props} node={split.b} path={[...path, 1]} />
      </div>
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
          title="New terminal"
          aria-label="New terminal"
          className="flex items-center gap-1 rounded-lg border border-[#2e2e2e] bg-[#242424] px-2 py-1.5 text-xs font-medium text-[#b3b3b3] hover:bg-[#2a2a2a] hover:text-[#e5e5e5] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
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
