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
  type ReplyContext,
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
import {
  DEFAULT_USAGE_SETTINGS,
  type UsageSidebarSettings,
} from "./usage-data";
import type { DemoView } from "./views";
import {
  DemoProjectView,
  initialPaneState,
  type ActionTerminalMap,
  type AgentTabState,
} from "./project-view";
import { activateTabByKey, activeTabKeys, type PaneNode } from "./pane-tree";
import { DemoActiveProvider, usePageVisible } from "./demo-active";
import { GlobalTerminalsView } from "./global-terminals-view";
import { SettingsView } from "./settings-view";
import { DemoAddProjectModal, type NewProjectInput } from "./add-project-modal";
import type { NewActionInput } from "./add-action-modal";
import type { AgentStep } from "./agent-script";

type DemoAppProps = {
  heightCss?: string;
  heightCssSm?: string;
};

type HintStage = "invite" | "next" | "hidden";

const EMPTY_SERVICES: ReadonlySet<string> = new Set<string>();
const EMPTY_ACTIONS: ActionTerminalMap = {};
const EMPTY_STATUS: Record<string, AgentTabState> = {};

// What a project's row reports when its tabs disagree: a problem outranks a
// question, which outranks work still in flight.
const ROLLUP_ORDER: AiStatus[] = ["error", "waiting", "running", "done"];

// What the agent in a fresh copy picks up, so the duplicate is visibly doing
// its own work rather than mirroring its parent.
const DUPLICATE_PROMPT = "Try the same change with a background job instead";

// The copy's opening turn, named in the source project's own files. Built here
// rather than through buildReply, whose replies all stop on a question — a
// duplicate has to look like a second agent working, not one asking.
function duplicateSteps(ctx: ReplyContext | undefined): AgentStep[] | undefined {
  if (!ctx) return undefined;
  return [
    { kind: "thinking" },
    { kind: "tool", label: "Read", arg: ctx.focusFile, result: ctx.focusLines },
    {
      kind: "text",
      text: `Same change, queued through ${ctx.wireTarget} instead, so the caller returns straight away.`,
    },
    { kind: "tool", label: "Write", arg: ctx.draftFile, result: "+52" },
    { kind: "tool", label: "Edit", arg: ctx.focusFile, result: "+7 -12" },
    { kind: "tool", label: "Bash", arg: ctx.testCmd, result: "running…" },
  ];
}

// How long the sessions a visitor has not opened yet claim to have been going,
// so their rows read like work already under way rather than starting now.
const SEEDED_AGENT_AGE_MS: Record<AiStatus, number> = {
  running: 41_000,
  waiting: 4 * 60_000,
  done: 52_000,
  error: 18_000,
};

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

// A visitor's first frame has to be the product, not an empty room: every
// project boots the way its owner left it — default profile up, agent open.
function initialRunningState(
  projects: DemoProject[],
): Record<string, Set<string>> {
  return Object.fromEntries(projects.map((p) => [p.name, new Set<string>()]));
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
  >(() => initialRunningState(INITIAL_PROJECTS));
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
  const [usageSettings, setUsageSettings] = useState<UsageSidebarSettings>(
    DEFAULT_USAGE_SETTINGS,
  );
  const [adding, setAdding] = useState(false);
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set([INITIAL_PROJECTS[0].name]),
  );
  const [autoCursor, setAutoCursor] = useState<AutoCursorState>({
    phase: "hidden",
  });
  const [hint, setHint] = useState<HintStage>("invite");
  const [isInView, setIsInView] = useState(false);
  const pageVisible = usePageVisible();
  const [glowActive, setGlowActive] = useState(false);
  const [ringPulseOn, setRingPulseOn] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const agentButtonRef = useRef<HTMLButtonElement | null>(null);
  const codexButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoCursorRanRef = useRef(false);
  const hasBeenSeenRef = useRef(false);
  // Stamped once when the demo mounts, so the seeded sessions all date from
  // the same moment rather than drifting apart as the tree re-renders.
  const [mountedAt] = useState(() => Date.now());

  const markInteracted = () => {
    setAutoCursor({ phase: "hidden" });
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
    let paired = false;

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

    // The headline claim is two agents at once, so the last beat opens the
    // other CLI too. It lands as a tab beside Claude's, the way an action
    // always opens — the tour never rearranges the visitor's panes.
    const launchCodexIfIdle = () => {
      const btn = codexButtonRef.current;
      if (paired || !btn) return;
      paired = true;
      btn.click();
      setHint("next");
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      startIfIdle();
      launchAgentIfIdle();
      launchCodexIfIdle();
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

    // Second beat: hand the freshly started project to Claude Code. It waits on
    // the services long enough for a visitor to watch them boot — jumping
    // straight to the agent buries the thing the first click just did. The
    // button can shift as services open panes, so each beat re-reads it.
    const agentAt = () => {
      const el = agentButtonRef.current;
      return el ? at(el) : null;
    };
    const moveToAgent = (phase: "travel" | "tap" | "fade") => () => {
      const pos = agentAt();
      if (pos) setAutoCursor({ phase, ...pos });
    };

    mime(5200, moveToAgent("travel"));
    step(6200, () => {
      if (!cursorHidden) moveToAgent("tap")();
      launchAgentIfIdle();
    });

    // Third beat: Claude has been streaming long enough to read, so the other
    // agent joins it in the same project.
    const codexAt = () => {
      const el = codexButtonRef.current;
      return el ? at(el) : null;
    };
    const moveToCodex = (phase: "travel" | "tap" | "fade") => () => {
      const pos = codexAt();
      if (pos) setAutoCursor({ phase, ...pos });
    };

    mime(9400, moveToCodex("travel"));
    step(10200, () => {
      if (!cursorHidden) moveToCodex("tap")();
      launchCodexIfIdle();
    });
    mime(10700, moveToCodex("fade"));
    mime(11200, () => setAutoCursor({ phase: "hidden" }));

    return () => {
      // Scrolling away mid-flight would otherwise strand the mimed cursor on
      // screen and abandon the sequence half-done — the effect never re-arms,
      // so the visitor would come back to a project that never got its agent.
      // Skip the remaining animation, but land on the state it was heading for.
      if (!cancelled) {
        startIfIdle();
        launchAgentIfIdle();
        launchCodexIfIdle();
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
        out[p.name] =
          ROLLUP_ORDER.find((s) => tabs.some((t) => t.status === s)) ?? "done";
      } else if (aiStatusByProject[p.name]) {
        out[p.name] = aiStatusByProject[p.name];
      }
    }
    return {
      sidebarStatus: out,
      hasAgentError: Object.values(out).includes("error"),
    };
  }, [projects, agentTabStatusByProject, aiStatusByProject]);

  // The real sidebar lists every project's agents, not just the open one's —
  // that overview is the point of it. A project this visit has never opened has
  // no live tabs to read, so its seeded status stands in for the session it
  // would be holding.
  const sidebarAgentTabs = useMemo(() => {
    const out: Record<string, Record<string, AgentTabState>> = {};
    for (const p of projects) {
      const live = agentTabStatusByProject[p.name];
      if (live && Object.keys(live).length) {
        out[p.name] = live;
        continue;
      }
      const seeded = aiStatusByProject[p.name];
      const action = p.actions.find((a) => a.name === p.autoStart);
      if (seeded && action) {
        const age = SEEDED_AGENT_AGE_MS[seeded];
        out[p.name] = {
          [`${action.name}-seed`]: {
            label: action.label,
            status: seeded,
            since: mountedAt - age,
            // Only a landed turn stops counting; one still working or waiting
            // keeps ticking, the way the app's row does.
            ...(seeded === "done" ? { until: mountedAt } : {}),
          },
        };
      }
    }
    return out;
  }, [projects, agentTabStatusByProject, aiStatusByProject, mountedAt]);

  // How many agents are stopped on a question, counted off the same rows the
  // sidebar draws so the footer and the list can never disagree.
  const needsYouCount = useMemo(
    () =>
      Object.values(sidebarAgentTabs).reduce(
        (total, tabs) =>
          total +
          Object.values(tabs).filter((tab) => tab.status === "waiting").length,
        0,
      ),
    [sidebarAgentTabs],
  );

  const activeAgentKeys = useMemo(
    () =>
      view === "project"
        ? activeTabKeys(treeByProject[selected] ?? null)
        : undefined,
    [view, treeByProject, selected],
  );

  // A sidebar agent row opens the tab it names, rather than only selecting the
  // project it sits under. A seeded row has no tab yet, so the tree is left
  // alone and selecting the project is the whole action.
  const openAgent = (projectName: string, key: string) => {
    selectProject(projectName);
    setTreeByProject((prev) => ({
      ...prev,
      [projectName]: activateTabByKey(prev[projectName] ?? null, key),
    }));
  };

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
            const next =
              typeof update === "function"
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
            g.uncommitted === 0
              ? g
              : { ...g, uncommitted: 0, ahead: g.ahead + 1 },
          ),
        onGitPull: () => updateGit((g) => ({ ...g, behind: 0 })),
        onGitPush: () =>
          updateGit((g) => (g.ahead === 0 ? g : { ...g, ahead: 0 })),
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
          ? {
              ...p,
              actions: [...p.actions, buildActionFromInput(input, p.actions)],
            }
          : p,
      ),
    );
  };

  // "Duplicate any project to run agents in parallel" is the page's headline
  // claim, so the menu item really makes one: a copy right under its parent,
  // its services already up, and the other CLI working in it. A worktree copy
  // is the same thing on a branch of its own.
  const handleDuplicate = (name: string, mode: "duplicate" | "worktree") => {
    const source = projects.find((p) => p.name === name);
    if (!source) return;
    const taken = new Set(projects.map((p) => p.name));
    const copyName = uniqueName(
      mode === "worktree" ? `${source.name}-wt` : `${source.name}-2`,
      taken,
    );
    // The copy leads with whichever agent the source is not already running, so
    // the pair reads as two agents on one codebase rather than the same one
    // twice.
    const sourceAgent = source.actions.find((a) => a.name === source.autoStart)?.agent;
    const copyAgent =
      source.actions.find((a) => a.agent && a.agent !== sourceAgent) ??
      source.actions.find((a) => a.agent);
    const branch =
      mode === "worktree" && source.git
        ? `${source.git.branch.split("/")[0] || "feat"}/${copyName}`
        : source.git?.branch;
    const copy: DemoProject = {
      ...source,
      name: copyName,
      label: copyName,
      root:
        mode === "worktree"
          ? `~/Projects/.worktrees/${copyName}`
          : `~/Projects/${copyName}`,
      actions: source.actions.map((a) =>
        a === copyAgent
          ? {
              ...a,
              autoPrompt: DUPLICATE_PROMPT,
              autoMode: "progress" as const,
              autoSteps: duplicateSteps(source.replyContext),
            }
          : { ...a, autoPrompt: undefined, autoMode: undefined, autoSteps: undefined },
      ),
      autoStart: copyAgent?.name,
      ...(source.git && branch
        ? { git: { ...source.git, branch, uncommitted: 0, ahead: 0, behind: 0 } }
        : {}),
    };
    const pane = initialPaneState(copy);
    setProjects((prev) => {
      const at = prev.findIndex((p) => p.name === name);
      const next = [...prev];
      next.splice(at + 1, 0, copy);
      return next;
    });
    if (copy.git) {
      setGitByProject((prev) => ({
        ...prev,
        [copyName]: { ...copy.git!, branches: [...copy.git!.branches] },
      }));
    }
    // A copy that boots empty would undercut the claim: it comes up running the
    // same profile its parent does.
    setRunningByProject((prev) => ({
      ...prev,
      [copyName]: new Set(
        (source.profiles[0]?.services ?? source.services.map((sv) => sv.name)).filter(
          (svc) => copy.services.some((cs) => cs.name === svc),
        ),
      ),
    }));
    setTreeByProject((prev) => ({ ...prev, [copyName]: pane.tree }));
    setActionTerminalsByProject((prev) => ({
      ...prev,
      [copyName]: pane.actionTerminals,
    }));
    selectProject(copyName);
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
    // Routed through selectProject so the new name lands in `visited` — the
    // keep-alive filter below only mounts visited projects, so setting
    // `selected` alone would leave the visitor on a blank pane.
    selectProject(newProject.name);
    setAdding(false);
  };

  // A pill that never leaves reads as chrome rather than a prompt. The clock
  // only runs while the frame is on screen, so a visitor who scrolls past and
  // comes back still gets the hint.
  useEffect(() => {
    if (hint === "hidden" || !isInView) return;
    const id = window.setTimeout(
      () => setHint("hidden"),
      hint === "next" ? 8000 : 12000,
    );
    return () => window.clearTimeout(id);
  }, [hint, isInView]);

  const hidden = hint === "hidden" || !isInView;
  // Nothing on a timer runs while the frame is scrolled away or the tab is in
  // the background — a demo left open in another tab should cost nothing.
  const demoActive = isInView && pageVisible;

  return (
    <DemoActiveProvider value={demoActive}>
      <div
        ref={containerRef}
        data-on-dark
        onPointerDownCapture={markInteracted}
        onKeyDownCapture={markInteracted}
        className={`replica-ui relative flex overflow-hidden rounded-xl bg-[#1a1a1a] ring-1 shadow-[0_1px_0_0_rgba(0,0,0,0.8),0_24px_60px_-20px_rgba(0,0,0,0.9)] h-[var(--demo-h)] sm:h-[var(--demo-h-sm)] transition-[box-shadow] duration-700 ${
          glowActive ? "ring-[#4ade80]/40" : "ring-white/[0.16]"
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
          agentTabStatusByProject={sidebarAgentTabs}
          onAddProject={() => setAdding(true)}
          onOpenAgent={openAgent}
        onDuplicate={handleDuplicate}
          activeAgentKeys={activeAgentKeys}
          onOpenView={setView}
          usageSettings={usageSettings}
          hasError={hasAgentError}
          needsYou={needsYouCount}
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
            <UsageView
              settings={usageSettings}
              onSettingsChange={setUsageSettings}
            />
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
                    actionTerminals={
                      actionTerminalsByProject[p.name] ?? EMPTY_ACTIONS
                    }
                    agentTabStatus={
                      agentTabStatusByProject[p.name] ?? EMPTY_STATUS
                    }
                    git={gitByProject[p.name]}
                    onAddAction={(input) => handleAddAction(p.name, input)}
                    startButtonRef={active ? startButtonRef : undefined}
                    agentButtonRef={active ? agentButtonRef : undefined}
                    codexButtonRef={active ? codexButtonRef : undefined}
                    startRingPulse={active && ringPulseOn}
                  />
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
                <span className="auto-cursor-tap absolute -left-2 -top-2 h-9 w-9 rounded-full border-2 border-[#60a5fa]/70 bg-[#60a5fa]/20" />
              )}
              <MousePointer2
                className="relative h-5 w-5 text-[#e5e5e5] drop-shadow-[0_2px_4px_rgba(0,0,0,0.55)]"
                strokeWidth={1.75}
                fill="#e5e5e5"
              />
            </div>
          </div>
        )}

        <div
          role="status"
          aria-live="polite"
          aria-hidden={hidden}
          className={`pointer-events-none absolute bottom-12 right-3 z-30 max-w-[260px] transition-all duration-500 ${
            hidden ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <div className="flex items-start gap-2 rounded-2xl border border-white/15 bg-black/75 px-3.5 py-1.5 text-[11px] sm:text-[12px] font-medium leading-snug text-[#e5e5e5] shadow-2xl backdrop-blur-md">
            <MousePointer2
              className="h-3.5 w-3.5 text-[#60a5fa] shrink-0"
              strokeWidth={2.25}
            />
            {hint === "next" ? (
              <>
                <span className="sm:hidden">
                  Two agents at once — tap around
                </span>
                <span className="hidden sm:inline">
                  Claude and Codex, side by side. Try auth-service next.
                </span>
              </>
            ) : (
              <>
                <span className="sm:hidden">Booting saas-app…</span>
                <span className="hidden sm:inline">
                  Booting saas-app — every pane is live. Click anything.
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </DemoActiveProvider>
  );
}
