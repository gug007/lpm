"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { MousePointer2 } from "lucide-react";
import INITIAL_PROJECTS, {
  INITIAL_AI_STATUS,
  type AiStatus,
  type DemoAction,
  type DemoBranch,
  type DemoGit,
  type DemoProject,
  type OutputLine,
} from "./projects";
import { DemoSidebar } from "./sidebar";
import { MobileProjectSwitcher } from "./mobile-project-switcher";
import { ActivityView } from "./activity-view";
import { AutomationsView } from "./automations-view";
import { UsageView } from "./usage-view";
import { StatsView } from "./stats-view";
import { MobileView } from "./mobile-view";
import {
  INITIAL_JOBS,
  runningJobCount,
  unreadJobCount,
  type DemoJob,
} from "./automations";
import { DEFAULT_USAGE_SETTINGS, type UsageSidebarSettings } from "./usage-data";
import type { DemoView } from "./views";
import {
  DemoProjectView,
  initialPaneState,
  type ActionTerminalMap,
  type AgentTabState,
} from "./project-view";
import type { PaneNode } from "./pane-tree";
import { GlobalTerminalsView } from "./global-terminals-view";
import { SettingsView } from "./settings-view";
import {
  DemoAddProjectModal,
  type NewProjectInput,
} from "./add-project-modal";
import type { NewActionInput } from "./add-action-modal";

type DemoAppProps = {
  heightCss?: string;
  heightCssSm?: string;
};

type HintStage = "invite" | "next" | "hidden";

const EMPTY_SERVICES: ReadonlySet<string> = new Set<string>();
const EMPTY_ACTIONS: ActionTerminalMap = {};
const EMPTY_STATUS: Record<string, AgentTabState> = {};

type AutoCursorState =
  | { phase: "hidden" }
  | { phase: "travel"; x: number; y: number }
  | { phase: "tap"; x: number; y: number }
  | { phase: "fade"; x: number; y: number };

function initialGitState(projects: DemoProject[]): Record<string, DemoGit> {
  const out: Record<string, DemoGit> = {};
  for (const p of projects) {
    if (p.git) out[p.name] = { ...p.git, branches: [...p.git.branches] };
  }
  return out;
}

function initialTreeState(
  projects: DemoProject[],
): Record<string, PaneNode | null> {
  return Object.fromEntries(
    projects.map((p) => [p.name, initialPaneState(p).tree]),
  );
}

function initialActionTerminalState(
  projects: DemoProject[],
): Record<string, ActionTerminalMap> {
  return Object.fromEntries(
    projects.map((p) => [p.name, initialPaneState(p).actionTerminals]),
  );
}

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function actionOutput(
  cmd: string,
  mode: "once" | "terminal",
): { output: OutputLine[]; loop?: { line: OutputLine; intervalMs: number } } {
  const head: OutputLine = { text: `$ ${cmd}`, color: "green", delay: 50 };
  if (mode === "terminal") {
    return {
      output: [
        head,
        { text: "starting process…", color: "muted", delay: 350 },
        { text: "ready — watching for changes", color: "cyan", delay: 850 },
      ],
      loop: {
        line: { text: "· recompiled in 41ms", color: "muted", delay: 0 },
        intervalMs: 2600,
      },
    };
  }
  return {
    output: [
      head,
      { text: "working…", color: "muted", delay: 350 },
      { text: "✓ done in 0.9s", color: "green", delay: 950 },
    ],
  };
}

function buildActionFromInput(
  input: NewActionInput,
  existing: DemoAction[],
): DemoAction {
  const taken = new Set(existing.map((a) => a.name));
  const name = uniqueName(slugify(input.name) || "action", taken);
  const { output, loop } = actionOutput(input.cmd, input.runMode);
  return {
    name,
    label: input.name,
    ...(input.emoji ? { emoji: input.emoji } : {}),
    cmd: input.cmd,
    display: "header",
    ...(input.runMode === "terminal" ? { type: "terminal" as const } : {}),
    ...(input.confirm ? { confirm: true } : {}),
    durationMs: 1000,
    output,
    ...(loop ? { loop } : {}),
  };
}

function buildProjectFromInput(
  input: NewProjectInput,
  existing: DemoProject[],
): DemoProject {
  const taken = new Set(existing.map((p) => p.name));
  const name = uniqueName(input.name, taken);
  if (input.kind === "ssh") {
    return {
      name,
      label: name,
      root: `ssh://${input.host}/~/${name}`,
      stack: `SSH · ${input.host}`,
      services: [],
      actions: [],
      profiles: [],
    };
  }
  return {
    name,
    label: name,
    root: `~/Projects/${name}`,
    stack: "Local project",
    services: [],
    actions: [],
    profiles: [],
  };
}

export function DemoApp({ heightCss, heightCssSm }: DemoAppProps) {
  const [projects, setProjects] = useState<DemoProject[]>(INITIAL_PROJECTS);
  const [selected, setSelected] = useState<string>(INITIAL_PROJECTS[0].name);
  const [runningByProject, setRunningByProject] = useState<
    Record<string, Set<string>>
  >(() => Object.fromEntries(INITIAL_PROJECTS.map((p) => [p.name, new Set()])));
  const [gitByProject, setGitByProject] = useState<Record<string, DemoGit>>(
    () => initialGitState(INITIAL_PROJECTS),
  );
  const [aiStatusByProject, setAiStatusByProject] = useState<
    Record<string, AiStatus>
  >(() => ({ ...INITIAL_AI_STATUS }));
  const [treeByProject, setTreeByProject] = useState<
    Record<string, PaneNode | null>
  >(() => initialTreeState(INITIAL_PROJECTS));
  const [actionTerminalsByProject, setActionTerminalsByProject] = useState<
    Record<string, ActionTerminalMap>
  >(() => initialActionTerminalState(INITIAL_PROJECTS));
  const [agentTabStatusByProject, setAgentTabStatusByProject] = useState<
    Record<string, Record<string, AgentTabState>>
  >({});
  const [view, setView] = useState<DemoView>("project");
  const [jobs, setJobs] = useState<DemoJob[]>(INITIAL_JOBS);
  const [usageSettings, setUsageSettings] =
    useState<UsageSidebarSettings>(DEFAULT_USAGE_SETTINGS);
  const [adding, setAdding] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set([INITIAL_PROJECTS[0].name]),
  );
  const [autoCursor, setAutoCursor] = useState<AutoCursorState>({
    phase: "hidden",
  });
  const [ringPulseOn, setRingPulseOn] = useState(false);
  const [hint, setHint] = useState<HintStage>("invite");
  const [isInView, setIsInView] = useState(false);
  const [glowActive, setGlowActive] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const agentButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoCursorRanRef = useRef(false);
  const hasBeenSeenRef = useRef(false);

  const markInteracted = () => {
    setAutoCursor({ phase: "hidden" });
    setRingPulseOn(false);
    setHint("hidden");
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsInView(entry.isIntersecting);
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView || hasBeenSeenRef.current) return;
    hasBeenSeenRef.current = true;
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;
    const raf = requestAnimationFrame(() => setGlowActive(true));
    const timeout = window.setTimeout(() => setGlowActive(false), 1200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      setGlowActive(false);
    };
  }, [isInView]);

  useEffect(() => {
    if (!isInView || autoCursorRanRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    if (typeof window === "undefined") return;

    const startBtn = startButtonRef.current;
    if (!startBtn) return;
    autoCursorRanRef.current = true;

    // The mimed cursor clicks real buttons, but each beat must fire at most
    // once: Start is a toggle, so a second click would stop what it started,
    // and a second agent click would open a duplicate tab.
    let started = false;
    let launched = false;

    const startIfIdle = () => {
      if (started) return;
      started = true;
      startBtn.click();
    };

    // The agent is the product's whole point, so the mimed cursor launches it
    // too — a passive visitor otherwise only ever sees service logs, which any
    // process manager can show.
    const launchAgentIfIdle = () => {
      const btn = agentButtonRef.current;
      if (launched || !btn) return;
      launched = true;
      btn.click();
      setHint("next");
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      startIfIdle();
      launchAgentIfIdle();
      return;
    }

    let cancelled = false;
    let cursorHidden = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
    };

    const hideCursor = () => {
      if (cursorHidden) return;
      cursorHidden = true;
      setAutoCursor({ phase: "hidden" });
      setRingPulseOn(false);
    };

    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimers();
      hideCursor();
    };

    // Moving the pointer means the visitor is taking over: drop the mimed
    // cursor, but still boot the project so the demo never sits empty.
    // Clicking or typing is real engagement — leave the project untouched.
    const onPointerMove = () => hideCursor();
    const onPointerDown = () => cancel();
    const onKeyDown = () => cancel();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("keydown", onKeyDown);

    const containerRect = container.getBoundingClientRect();
    const at = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - containerRect.left,
        y: r.top + r.height / 2 - containerRect.top,
      };
    };
    const start = at(startBtn);
    const from = {
      x: containerRect.width * 0.45,
      y: containerRect.height * 0.65,
    };

    const step = (ms: number, fn: () => void) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, ms),
      );
    };
    // Most beats are pure cursor animation: skip them once the visitor's own
    // pointer has taken over, but let the clicks through.
    const mime = (ms: number, fn: () => void) =>
      step(ms, () => {
        if (!cursorHidden) fn();
      });

    mime(0, () => setRingPulseOn(true));
    mime(600, () => setAutoCursor({ phase: "travel", ...from }));
    mime(680, () => setAutoCursor({ phase: "travel", ...start }));
    step(1700, () => {
      if (!cursorHidden) setAutoCursor({ phase: "tap", ...start });
      startIfIdle();
    });
    mime(2000, () => setRingPulseOn(false));

    // Second beat: hand the freshly started project to Claude Code. The button
    // can shift as services open panes, so each beat re-reads its position.
    const agentAt = () => {
      const el = agentButtonRef.current;
      return el ? at(el) : null;
    };
    const moveToAgent = (phase: "travel" | "tap" | "fade") => () => {
      const pos = agentAt();
      if (pos) setAutoCursor({ phase, ...pos });
    };

    mime(2400, moveToAgent("travel"));
    step(3400, () => {
      if (!cursorHidden) moveToAgent("tap")();
      launchAgentIfIdle();
    });
    mime(3900, moveToAgent("fade"));
    mime(4400, () => setAutoCursor({ phase: "hidden" }));

    return () => {
      // Scrolling away mid-flight would otherwise strand the mimed cursor on
      // screen and abandon the sequence half-done — the effect never re-arms,
      // so the visitor would come back to a project that never got its agent.
      // Skip the remaining animation, but land on the state it was heading for.
      if (!cancelled) {
        startIfIdle();
        launchAgentIfIdle();
      }
      cancelled = true;
      clearTimers();
      hideCursor();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("keydown", onKeyDown);
    };
  }, [isInView]);

  const project = useMemo(
    () => projects.find((p) => p.name === selected) ?? projects[0],
    [projects, selected],
  );

  const selectProject = (name: string) => {
    setSelected(name);
    setView("project");
    setVisited((prev) => (prev.has(name) ? prev : new Set(prev).add(name)));
    // Viewing a project consumes its unopened-attention badge; from here on the
    // sidebar reads the live status off the session itself.
    setAiStatusByProject((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // Sessions stay mounted across switches, so a project's badge comes from its
  // live agent tabs when it has any, and falls back to the seeded rollup for
  // projects this visit has never opened.
  const { sidebarStatus, hasAgentError } = useMemo(() => {
    const out: Record<string, AiStatus> = {};
    for (const p of projects) {
      const tabs = Object.values(agentTabStatusByProject[p.name] ?? {});
      if (tabs.length) {
        out[p.name] = tabs.some((t) => t.status === "running")
          ? "running"
          : "done";
      } else if (aiStatusByProject[p.name]) {
        out[p.name] = aiStatusByProject[p.name];
      }
    }
    return {
      sidebarStatus: out,
      hasAgentError: Object.values(out).includes("error"),
    };
  }, [projects, agentTabStatusByProject, aiStatusByProject]);

  // Every visited project stays mounted, so its handlers must bind to a name
  // rather than to whichever project happens to be selected.
  const handlers = useMemo(() => {
    const build = (p: DemoProject) => {
    const name = p.name;

    // Narrows a by-project record down to this project's slice.
    const scoped =
      <T,>(
        setAll: Dispatch<SetStateAction<Record<string, T>>>,
        fallback: () => T,
      ): Dispatch<SetStateAction<T>> =>
      (update) =>
        setAll((prev) => {
          const cur = name in prev ? prev[name] : fallback();
          const next = typeof update === "function"
            ? (update as (c: T) => T)(cur)
            : update;
          return { ...prev, [name]: next };
        });

    const setTree = scoped(setTreeByProject, () => initialPaneState(p).tree);
    const setActionTerminals = scoped(
      setActionTerminalsByProject,
      () => initialPaneState(p).actionTerminals,
    );
    const setAgentTabStatus = scoped(setAgentTabStatusByProject, () => ({}));

    const updateGit = (mutate: (g: DemoGit) => DemoGit) => {
      setGitByProject((prev) => {
        const cur = prev[name];
        if (!cur) return prev;
        return { ...prev, [name]: mutate(cur) };
      });
    };

    return {
      setTree,
      setActionTerminals,
      setAgentTabStatus,
      onStartServices: (names: string[]) =>
        setRunningByProject((prev) => ({
          ...prev,
          [name]: new Set(
            names.filter((n) => p.services.some((s) => s.name === n)),
          ),
        })),
      onStopAll: () =>
        setRunningByProject((prev) => ({ ...prev, [name]: new Set() })),
      onToggleService: (svc: string) =>
        setRunningByProject((prev) => {
          const next = new Set(prev[name]);
          if (next.has(svc)) next.delete(svc);
          else next.add(svc);
          return { ...prev, [name]: next };
        }),
      onGitCheckout: (b: DemoBranch) =>
        updateGit((g) => {
          const hasLocal = g.branches.some(
            (x) => !x.remote && x.name === b.name,
          );
          const branches =
            b.remote && !hasLocal
              ? [{ name: b.name, age: "now" }, ...g.branches]
              : g.branches;
          return {
            ...g,
            branch: b.name,
            uncommitted: 0,
            ahead: 0,
            behind: 0,
            branches,
          };
        }),
      onGitCommit: () =>
        updateGit((g) =>
          g.uncommitted === 0 ? g : { ...g, uncommitted: 0, ahead: g.ahead + 1 },
        ),
      onGitPull: () => updateGit((g) => ({ ...g, behind: 0 })),
      onGitPush: () => updateGit((g) => (g.ahead === 0 ? g : { ...g, ahead: 0 })),
      // Fetch only updates remote-tracking refs; the demo has nothing new to
      // pull in, so this is a no-op — same as a real "Already up to date".
      onGitFetch: () => {},
      onGitMerge: () =>
        updateGit((g) => ({ ...g, ahead: g.ahead + 1, uncommitted: 0 })),
      onGitCreatePR: () =>
        updateGit((g) => (g.ahead === 0 ? g : { ...g, ahead: 0 })),
      onGitDiscard: () => updateGit((g) => ({ ...g, uncommitted: 0 })),
      onGitSync: () => updateGit((g) => ({ ...g, ahead: 0, behind: 0 })),
      onGitCreateBranch: (branch: string) =>
        updateGit((g) => ({
          ...g,
          branch,
          uncommitted: 0,
          ahead: 0,
          behind: 0,
          branches: [{ name: branch, age: "now" }, ...g.branches],
        })),
      onGitRenameBranch: (oldName: string, newName: string) =>
        updateGit((g) => ({
          ...g,
          branch: g.branch === oldName ? newName : g.branch,
          branches: g.branches.map((b) =>
            !b.remote && b.name === oldName ? { ...b, name: newName } : b,
          ),
        })),
      onGitDeleteBranch: (branch: string) =>
        updateGit((g) => ({
          ...g,
          branches: g.branches.filter((b) => b.remote || b.name !== branch),
        })),
      onGitRemoveRemote: (branch: DemoBranch) =>
        updateGit((g) => ({
          ...g,
          branches: g.branches.filter(
            (b) => !(b.remote === branch.remote && b.name === branch.name),
          ),
        })),
    };
    };
    // Setters from useState are stable, so only the project list can invalidate.
    return Object.fromEntries(projects.map((p) => [p.name, build(p)]));
  }, [projects]);

  const handleAddAction = (name: string, input: NewActionInput) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.name === name
          ? { ...p, actions: [...p.actions, buildActionFromInput(input, p.actions)] }
          : p,
      ),
    );
  };

  const handleAddProject = (input: NewProjectInput) => {
    const newProject = buildProjectFromInput(input, projects);
    const pane = initialPaneState(newProject);
    setProjects((prev) => [...prev, newProject]);
    setRunningByProject((prev) => ({ ...prev, [newProject.name]: new Set() }));
    setTreeByProject((prev) => ({ ...prev, [newProject.name]: pane.tree }));
    setActionTerminalsByProject((prev) => ({
      ...prev,
      [newProject.name]: pane.actionTerminals,
    }));
    setSelected(newProject.name);
    setView("project");
    setAdding(false);
  };

  // A pill that never leaves reads as chrome rather than a prompt.
  useEffect(() => {
    if (hint !== "next") return;
    const id = window.setTimeout(() => setHint("hidden"), 24000);
    return () => window.clearTimeout(id);
  }, [hint]);

  const hidden = hint === "hidden" || !isInView;

  return (
    <div
      ref={containerRef}
      data-on-dark
      onPointerDownCapture={markInteracted}
      onKeyDownCapture={markInteracted}
      className={`replica-ui relative flex overflow-hidden rounded-xl border border-gray-200 dark:border-[#2e2e2e] shadow-2xl shadow-gray-200/60 dark:shadow-black/60 bg-[#1a1a1a] h-[var(--demo-h)] sm:h-[var(--demo-h-sm)] transition-[box-shadow] duration-700 ${
        glowActive ? "ring-2 ring-emerald-500/30" : "ring-0 ring-transparent"
      }`}
      style={
        {
          "--demo-h": heightCss ?? "min(520px, calc(100vh - 140px))",
          "--demo-h-sm":
            heightCssSm ?? heightCss ?? "min(640px, calc(100vh - 180px))",
        } as React.CSSProperties
      }
    >
      <DemoSidebar
        projects={projects}
        selected={project.name}
        activeView={view}
        onSelect={selectProject}
        runningByProject={runningByProject}
        aiStatusByProject={sidebarStatus}
        onAddProject={() => setAdding(true)}
        onOpenView={setView}
        usageSettings={usageSettings}
        hasError={hasAgentError}
        unreadAutomations={unreadJobCount(jobs)}
        runningAutomations={runningJobCount(jobs)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileProjectSwitcher
          projects={projects}
          selected={project.name}
          onSelect={selectProject}
          runningByProject={runningByProject}
          onAddProject={() => setAdding(true)}
        />
        {view === "terminals" ? (
          <GlobalTerminalsView />
        ) : view === "settings" ? (
          <SettingsView />
        ) : view === "activity" ? (
          <ActivityView
            projects={projects}
            runningByProject={runningByProject}
            aiStatusByProject={aiStatusByProject}
            agentTabStatusByProject={agentTabStatusByProject}
            jobs={jobs}
            onOpenProject={selectProject}
            onOpenAutomations={() => setView("automations")}
          />
        ) : view === "automations" ? (
          <AutomationsView
            jobs={jobs}
            setJobs={setJobs}
            projects={projects.map((p) => p.name)}
          />
        ) : view === "usage" ? (
          <UsageView settings={usageSettings} onSettingsChange={setUsageSettings} />
        ) : view === "stats" ? (
          <StatsView />
        ) : view === "mobile" ? (
          <MobileView />
        ) : null}
        {/* Visited projects stay mounted: switching away must not reboot a
            service's logs or erase a conversation you were having. */}
        {projects
          .filter((p) => visited.has(p.name))
          .map((p) => {
            const h = handlers[p.name];
            const active = view === "project" && p.name === project.name;
            return (
              <div
                key={p.name}
                className={
                  active ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"
                }
              >
                <DemoProjectView
                  {...h}
                  project={p}
                  runningServices={runningByProject[p.name] ?? EMPTY_SERVICES}
                  tree={treeByProject[p.name] ?? null}
                  actionTerminals={actionTerminalsByProject[p.name] ?? EMPTY_ACTIONS}
                  agentTabStatus={agentTabStatusByProject[p.name] ?? EMPTY_STATUS}
                  git={gitByProject[p.name]}
                  onAddAction={(input) => handleAddAction(p.name, input)}
                  startButtonRef={active ? startButtonRef : undefined}
                  agentButtonRef={active ? agentButtonRef : undefined}
                  startRingPulse={active && ringPulseOn}                />
              </div>
            );
          })}
      </div>
      <DemoAddProjectModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreate={handleAddProject}
      />

      {autoCursor.phase !== "hidden" && (
        <div
          aria-hidden
          className={`pointer-events-none absolute z-40 transition-[transform,opacity] ${
            autoCursor.phase === "travel"
              ? "duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] opacity-100"
              : autoCursor.phase === "fade"
                ? "duration-[400ms] ease-out opacity-0"
                : "duration-150 ease-out opacity-100"
          }`}
          style={{
            top: 0,
            left: 0,
            transform: `translate3d(${autoCursor.x}px, ${autoCursor.y}px, 0)`,
          }}
        >
          <div className="relative">
            {autoCursor.phase === "tap" && (
              <span className="auto-cursor-tap absolute -left-2 -top-2 h-9 w-9 rounded-full border-2 border-indigo-300/70 bg-indigo-300/20" />
            )}
            <MousePointer2
              className="relative h-5 w-5 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]"
              strokeWidth={1.75}
              fill="white"
            />
          </div>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        aria-hidden={hidden}
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-6 transition-all duration-500 ${
          hidden
            ? "translate-y-2 opacity-0"
            : "translate-y-0 opacity-100 motion-safe:animate-bounce-soft"
        }`}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3.5 py-1.5 text-[11px] sm:text-[12px] font-medium text-white shadow-2xl backdrop-blur-md">
          <MousePointer2
            className="h-3.5 w-3.5 text-indigo-300 shrink-0"
            strokeWidth={2.25}
          />
          {hint === "next" ? (
            <>
              <span className="sm:hidden">Claude is working — tap around</span>
              <span className="hidden sm:inline">
                Claude keeps working while you switch projects — try
                auth-service.
              </span>
            </>
          ) : (
            <>
              <span className="sm:hidden">Tap anything — it works</span>
              <span className="hidden sm:inline">
                Yes, this really works. Click anything.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
