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
  type DemoBranch,
  type DemoGit,
  type DemoProject,
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
import {
  activateTabByKey,
  activeTabKeys,
  collectLeaves,
  setActiveTab,
  syncServiceTabs,
  type PaneNode,
} from "./pane-tree";
import { DemoActiveProvider, usePageVisible } from "./demo-active";
import { GlobalTerminalsView } from "./global-terminals-view";
import { SettingsView } from "./settings-view";
import { DemoAddProjectModal, type NewProjectInput } from "./add-project-modal";
import type { NewActionInput } from "./add-action-modal";
import { NoProjectsPane } from "./no-projects-pane";
import { RemoveProjectDialog, removeProject } from "./remove-project";
import {
  DUPLICATE_PROMPT,
  SEEDED_AGENT_AGE_MS,
  buildActionFromInput,
  buildProjectFromInput,
  duplicateSteps,
  initialActionTerminalState,
  initialGitState,
  initialRunningState,
  initialTreeState,
  uniqueName,
  worktreeBranch,
} from "./project-factory";

type DemoAppProps = {
  heightCss?: string;
  heightCssSm?: string;
};

type HintStage = "invite" | "next";

const EMPTY_SERVICES: ReadonlySet<string> = new Set<string>();
const EMPTY_ACTIONS: ActionTerminalMap = {};
const EMPTY_STATUS: Record<string, AgentTabState> = {};

// What a project's row reports when its tabs disagree: a problem outranks a
// question, which outranks work still in flight.
const ROLLUP_ORDER: AiStatus[] = ["error", "waiting", "running", "done"];

// One row of project header, until the live one reports otherwise.
const HEADER_ROW_H = 40;
// What sits between the header and the first line of output: the pane's 33px
// tab strip, the two hairlines around it, and a little air. The hint pill hangs
// below the pair, so it never covers the tabs its own line points at.
const PILL_DROP_BELOW_HEADER = 40;

// What a branch is ahead/behind its upstream by. git keeps this per branch, so
// the demo has to park it when a checkout leaves the branch.
type BranchSync = { ahead: number; behind: number };

type AutoCursorState =
  | { phase: "hidden" }
  | { phase: "travel"; x: number; y: number }
  | { phase: "tap"; x: number; y: number }
  | { phase: "fade"; x: number; y: number };

export function DemoApp({ heightCss, heightCssSm }: DemoAppProps) {
  const [projects, setProjects] = useState<DemoProject[]>(INITIAL_PROJECTS);
  const [selected, setSelected] = useState<string>(INITIAL_PROJECTS[0].name);
  const [runningByProject, setRunningByProject] = useState<
    Record<string, Set<string>>
  >(() => initialRunningState(INITIAL_PROJECTS));
  const [gitByProject, setGitByProject] = useState<Record<string, DemoGit>>(
    () => initialGitState(INITIAL_PROJECTS),
  );
  // Only the branch on screen has its counts in gitByProject; every branch left
  // behind keeps its own here, so a round trip returns to what it had. Nothing
  // renders from it, so a ref keeps it out of the render path.
  const branchSyncByProject = useRef<
    Record<string, Record<string, BranchSync>>
  >({});
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
  const [headerHeight, setHeaderHeight] = useState(HEADER_ROW_H);
  // Visibility is held apart from the stage so the pill keeps drawing the line
  // it was showing all the way through its half-second fade.
  const [hintVisible, setHintVisible] = useState(true);
  const [isInView, setIsInView] = useState(false);
  // Glimpsed is enough to keep the frame alive; parked is what the tour waits
  // for, so nobody spends the whole performance on it below the fold.
  const [isParked, setIsParked] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const pageVisible = usePageVisible();
  const [glowActive, setGlowActive] = useState(false);
  const [ringPulseOn, setRingPulseOn] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const agentButtonRef = useRef<HTMLButtonElement | null>(null);
  const codexButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoCursorRanRef = useRef(false);
  const hasBeenSeenRef = useRef(false);
  // Read by the mimed tour at the moment it would press Start, which is long
  // after the effect that owns it last re-ran.
  const servicesRunningRef = useRef(false);
  // Stamped once when the demo mounts, so the seeded sessions all date from
  // the same moment rather than drifting apart as the tree re-renders.
  const [mountedAt] = useState(() => Date.now());

  const markInteracted = () => {
    setAutoCursor({ phase: "hidden" });
    setHintVisible(false);
  };

  useEffect(() => {
    servicesRunningRef.current = (runningByProject[selected]?.size ?? 0) > 0;
  }, [runningByProject, selected]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
          // A hair under each threshold: the ratio a crossing reports is the
          // threshold itself, and floating point does not always agree.
          setIsInView(ratio >= 0.38);
          setIsParked(ratio >= 0.8);
        }
      },
      { threshold: [0.4, 0.85] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isParked || hasBeenSeenRef.current) return;
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
  }, [isParked]);

  useEffect(() => {
    if (!isParked || autoCursorRanRef.current) return;
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
      // Start is a toggle: once the visitor's own click has booted the project
      // this same button reads Stop, and pressing it would shut it all down.
      if (!servicesRunningRef.current) startBtn.click();
    };

    // The agent is the product's whole point, so the mimed cursor launches it
    // too — a passive visitor otherwise only ever sees service logs, which any
    // process manager can show.
    const launchAgentIfIdle = () => {
      const btn = agentButtonRef.current;
      if (launched || !btn) return;
      launched = true;
      btn.click();
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
      setHintVisible(true);
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
    // cursor, but still boot the project so the demo never sits empty. A click
    // lands the boot too — synchronously, so it is still the selected
    // project's Start button being pressed rather than whichever row the click
    // is about to select.
    const onPointerMove = () => hideCursor();
    // The chevron beside Start and the menu it opens: pressing either only
    // opens or uses that menu, so the boot is neither wanted here nor spent —
    // a later click elsewhere still lands it.
    const inStartMenu = (node: Node) =>
      !!startBtn.parentElement?.contains(node) ||
      (node instanceof Element && !!node.closest('[role="menu"]'));
    // Pressing Start IS the boot, so it latches the flag rather than injecting
    // one: the browser delivers pointerdown and click in separate tasks, so a
    // click here would flip the button to Stop before the visitor's own click
    // lands on it and shut the project straight back down.
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && startBtn.contains(node)) started = true;
      else if (!node || !inStartMenu(node)) startIfIdle();
      cancel();
    };
    const onKeyDown = () => cancel();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("keydown", onKeyDown);

    const containerRect = container.getBoundingClientRect();
    // Re-read the frame every beat: the visitor is usually still scrolling it
    // into place, and a stale origin would land the cursor on the wrong control.
    const at = (el: HTMLElement) => {
      const frame = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - frame.left,
        y: r.top + r.height / 2 - frame.top,
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
    const moveToCodex = (phase: "travel" | "tap") => () => {
      const pos = codexAt();
      if (pos) setAutoCursor({ phase, ...pos });
    };

    // The action strip scrolls sideways on a narrow stage, so the chip has to
    // be brought inside it before the cursor aims — the strip's own scrollLeft,
    // never scrollIntoView, which walks to the document and would yank the
    // marketing page. If it still will not fit, the tab opens without a mime
    // rather than tapping whatever chip happens to be under that point.
    const revealCodex = () => {
      const btn = codexButtonRef.current;
      if (!btn) return false;
      let strip = btn.parentElement;
      while (strip && strip !== container && strip.scrollWidth <= strip.clientWidth)
        strip = strip.parentElement;
      if (!strip || strip === container) return true;
      const box = strip.getBoundingClientRect();
      const left = btn.getBoundingClientRect().left - box.left + strip.scrollLeft;
      const right = left + btn.offsetWidth;
      if (left < strip.scrollLeft) strip.scrollLeft = left;
      else if (right > strip.scrollLeft + strip.clientWidth)
        strip.scrollLeft = right - strip.clientWidth;
      const chip = btn.getBoundingClientRect();
      return chip.left >= box.left - 1 && chip.right <= box.right + 1;
    };

    mime(9400, () => {
      if (revealCodex()) moveToCodex("travel")();
    });
    step(10200, () => {
      if (!cursorHidden && revealCodex()) moveToCodex("tap")();
      launchCodexIfIdle();
    });
    // Fades from wherever the cursor actually is, which is the agent chip when
    // Codex could not be reached.
    mime(10700, () =>
      setAutoCursor((cur) =>
        cur.phase === "hidden" ? cur : { phase: "fade", x: cur.x, y: cur.y },
      ),
    );
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
  }, [isParked]);

  // Undefined once the last project is removed — the frame then shows its
  // empty room rather than a workspace for a project that is gone.
  const project: DemoProject | undefined = useMemo(
    () => projects.find((p) => p.name === selected) ?? projects[0],
    [projects, selected],
  );

  // The header wraps its action chips onto a row of their own on a narrow stage,
  // so the pill's offset follows the header's measured height rather than
  // assuming one row. Every visited project keeps its own header mounted; the
  // ones that are not on screen measure zero, so a zero reading is ignored and
  // the last real height stands.
  const activeProjectName = project?.name;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const head = [
      ...container.querySelectorAll<HTMLElement>("[data-demo-header]"),
    ].find((el) => el.dataset.demoHeader === activeProjectName);
    if (!head) return;
    const observer = new ResizeObserver(() => {
      const { height } = head.getBoundingClientRect();
      if (height > 0) setHeaderHeight(height);
    });
    observer.observe(head);
    return () => observer.disconnect();
  }, [activeProjectName]);

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

      const branchSync = branchSyncByProject.current;

      // Stores the counts the branch being left is carrying, and answers with
      // the map to read the branch being entered out of.
      const parkSync = (g: DemoGit): Record<string, BranchSync> => {
        const next = {
          ...branchSync[name],
          [g.branch]: { ahead: g.ahead, behind: g.behind },
        };
        branchSync[name] = next;
        return next;
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
        // A checkout carries the working tree across with it — git only refuses
        // the switch, it never throws the changes away — so `uncommitted`
        // stays put and the sync counts come from the branch being entered.
        onGitCheckout: (b: DemoBranch) =>
          updateGit((g) => {
            const hasLocal = g.branches.some(
              (x) => !x.remote && x.name === b.name,
            );
            const branches =
              b.remote && !hasLocal
                ? [{ name: b.name, age: "now" }, ...g.branches]
                : g.branches;
            const parked = parkSync(g);
            return {
              ...g,
              branch: b.name,
              ...(parked[b.name] ?? { ahead: 0, behind: 0 }),
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
        // A merge lands a commit on the current branch and leaves the working
        // tree alone — it would refuse to run rather than swallow local edits —
        // so the visitor's uncommitted files are still there afterwards.
        onGitMerge: () => updateGit((g) => ({ ...g, ahead: g.ahead + 1 })),
        onGitCreatePR: () =>
          updateGit((g) => (g.ahead === 0 ? g : { ...g, ahead: 0 })),
        onGitDiscard: () => updateGit((g) => ({ ...g, uncommitted: 0 })),
        onGitSync: () => updateGit((g) => ({ ...g, ahead: 0, behind: 0 })),
        // `git checkout -b` is still a checkout: the tree comes along, and the
        // new branch simply has nothing to be ahead or behind by yet.
        onGitCreateBranch: (branch: string) =>
          updateGit((g) => {
            parkSync(g);
            return {
              ...g,
              branch,
              ahead: 0,
              behind: 0,
              branches: [{ name: branch, age: "now" }, ...g.branches],
            };
          }),
        onGitRenameBranch: (oldName: string, newName: string) =>
          updateGit((g) => {
            const parked = branchSync[name];
            if (parked && oldName in parked) {
              const { [oldName]: moved, ...rest } = parked;
              branchSync[name] = { ...rest, [newName]: moved };
            }
            return {
              ...g,
              branch: g.branch === oldName ? newName : g.branch,
              branches: g.branches.map((b) =>
                !b.remote && b.name === oldName ? { ...b, name: newName } : b,
              ),
            };
          }),
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
    const sourceAgent =
      source.actions.find((a) => a.name === source.autoStart)?.agent ??
      source.actions.find((a) => a.agent)?.agent;
    const copyAgent =
      source.actions.find((a) => a.agent && a.agent !== sourceAgent) ??
      source.actions.find((a) => a.agent);
    const branch =
      mode === "worktree" && source.git
        ? worktreeBranch(copyName)
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
    // The copy comes up as if someone had pressed Start on it: the same
    // services its parent runs, their log tabs already in the strip.
    const running = (
      source.profiles[0]?.services ?? source.services.map((sv) => sv.name)
    ).filter((svc) => copy.services.some((cs) => cs.name === svc));
    const ordered = copy.services
      .map((s) => s.name)
      .filter((n) => running.includes(n));
    const withServices = syncServiceTabs(pane.tree, ordered);
    // syncServiceTabs pulls focus onto the logs it just added, which would bury
    // the agent already working the duplicate prompt — the point of the copy.
    const leaf = withServices ? collectLeaves(withServices)[0] : undefined;
    const tree =
      leaf && withServices
        ? setActiveTab(withServices, leaf.id, leaf.tabs.length - 1)
        : withServices;
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
    setRunningByProject((prev) => ({ ...prev, [copyName]: new Set(running) }));
    setTreeByProject((prev) => ({ ...prev, [copyName]: tree }));
    setActionTerminalsByProject((prev) => ({
      ...prev,
      [copyName]: pane.actionTerminals,
    }));
    selectProject(copyName);
  };

  const handleRemoveProject = (name: string) =>
    removeProject(name, {
      projects,
      selected,
      selectProject,
      setSelected,
      setProjects,
      setRunningByProject,
      setGitByProject,
      setAiStatusByProject,
      setTreeByProject,
      setActionTerminalsByProject,
      setAgentTabStatusByProject,
      setVisited,
    });

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
  // only runs while the frame is parked in the viewport, so its whole life is
  // not spent under the fold.
  useEffect(() => {
    if (!hintVisible || !isParked) return;
    const id = window.setTimeout(
      () => setHintVisible(false),
      hint === "next" ? 8000 : 12000,
    );
    return () => window.clearTimeout(id);
  }, [hint, hintVisible, isParked]);

  const hidden = !hintVisible || !isParked;
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
          selected={project?.name ?? ""}
          activeView={view}
          onSelect={selectProject}
          runningByProject={runningByProject}
          aiStatusByProject={sidebarStatus}
          agentTabStatusByProject={sidebarAgentTabs}
          onAddProject={() => setAdding(true)}
          onOpenAgent={openAgent}
          onDuplicate={handleDuplicate}
          onRemoveProject={setRemoving}
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
            selected={project?.name ?? ""}
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
              const active = view === "project" && p.name === project?.name;
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
          {view === "project" && !project && (
            <NoProjectsPane onAddProject={() => setAdding(true)} />
          )}
        </div>
        <DemoAddProjectModal
          open={adding}
          onClose={() => setAdding(false)}
          onCreate={handleAddProject}
        />
        {removing && (
          <RemoveProjectDialog
            name={removing}
            onCancel={() => setRemoving(null)}
            onConfirm={() => {
              handleRemoveProject(removing);
              setRemoving(null);
            }}
          />
        )}

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

        {/* Clear of the header and the tab strip: for the ten seconds it is up
          the pill would otherwise sit on the split-layout buttons and the tabs
          its own line is telling the visitor to use. */}
        <div
          role="status"
          aria-live="polite"
          aria-hidden={hidden}
          style={{ top: headerHeight + PILL_DROP_BELOW_HEADER }}
          className={`pointer-events-none absolute right-3 z-30 max-w-[260px] transition-all duration-500 ${
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
                  Two agents at once — switch tabs
                </span>
                <span className="hidden sm:inline">
                  Two agents on one project — switch tabs. ml-pipeline is asking
                  you something.
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
