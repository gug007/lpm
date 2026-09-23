"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
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
  tabKey,
  type PaneNode,
} from "./pane-tree";
import { agentDriveKey, withAgentDrive } from "./agent-drive";
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
import {
  HOME_TOUR,
  TOUR_FALLBACK_PROMPT,
  TOUR_NEW_PROJECT_FOLDER,
  type Tour,
  type TourHandle,
  type TourHint,
  type TourState,
  type TourStepId,
} from "./tour";
import { tourStepMoves, type TourContext, type TourMove } from "./tour-moves";
import { AutoCursor, type AutoCursorState } from "./auto-cursor";
import { seededRandom } from "./natural";
import { detectionNotice } from "./detected-services";
import { DemoToast, type DemoNotice } from "./demo-toast";

type DemoAppProps = {
  heightCss?: string;
  heightCssSm?: string;
  // The step list beside the frame reads the tour's progress through onTour
  // and presses the window's controls through tourRef.
  tourRef?: React.Ref<TourHandle>;
  onTour?: (state: TourState) => void;
  // Which steps the opening tour plays, in what order — a page's own list, or
  // the home page's.
  tour?: Tour;
  // What the frame opens with. A page that wants an untouched install hands in
  // empty lists, and the visitor starts by adding a project of their own.
  seedProjects?: DemoProject[];
  seedJobs?: DemoJob[];
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
// How long before the tour presses Start its ring starts pulsing.
const RING_LEAD_MS = 1700;
// Having clicked into a field, a hand moves the pointer off the text it is
// about to type: this long after the click, and this far.
const ASIDE_DELAY_MS = 350;
const ASIDE_OFFSET = { x: 44, y: 16 };

// What a branch is ahead/behind its upstream by. git keeps this per branch, so
// the demo has to park it when a checkout leaves the branch.
type BranchSync = { ahead: number; behind: number };

// The selected project's name and the prompt each of its agents opens with,
// for the tour's beats that type into a composer.
function tourPromptsFor(project: DemoProject | undefined) {
  const promptFor = (agent: "claude" | "codex") =>
    project?.actions.find((a) => a.agent === agent)?.autoPrompt ??
    TOUR_FALLBACK_PROMPT;
  return {
    project: project?.name ?? "",
    claude: promptFor("claude"),
    codex: promptFor("codex"),
  };
}

// The canned statuses belong to the seeded projects; a frame that opens with
// its own list takes only the ones it actually shows.
function seededAiStatus(projects: DemoProject[]): Record<string, AiStatus> {
  const status: Record<string, AiStatus> = {};
  for (const project of projects) {
    const seeded = INITIAL_AI_STATUS[project.name];
    if (seeded) status[project.name] = seeded;
  }
  return status;
}

export function DemoApp({
  heightCss,
  heightCssSm,
  tourRef,
  onTour,
  tour = HOME_TOUR,
  seedProjects = INITIAL_PROJECTS,
  seedJobs = INITIAL_JOBS,
}: DemoAppProps) {
  const [projects, setProjects] = useState<DemoProject[]>(seedProjects);
  const [selected, setSelected] = useState<string>(
    seedProjects[0]?.name ?? "",
  );
  const [runningByProject, setRunningByProject] = useState<
    Record<string, Set<string>>
  >(() => initialRunningState(seedProjects));
  const [gitByProject, setGitByProject] = useState<Record<string, DemoGit>>(
    () => initialGitState(seedProjects),
  );
  // Only the branch on screen has its counts in gitByProject; every branch left
  // behind keeps its own here, so a round trip returns to what it had. Nothing
  // renders from it, so a ref keeps it out of the render path.
  const branchSyncByProject = useRef<
    Record<string, Record<string, BranchSync>>
  >({});
  const [aiStatusByProject, setAiStatusByProject] = useState<
    Record<string, AiStatus>
  >(() => seededAiStatus(seedProjects));
  const [treeByProject, setTreeByProject] = useState<
    Record<string, PaneNode | null>
  >(() => initialTreeState(seedProjects));
  const [actionTerminalsByProject, setActionTerminalsByProject] = useState<
    Record<string, ActionTerminalMap>
  >(() => initialActionTerminalState(seedProjects));
  const [agentTabStatusByProject, setAgentTabStatusByProject] = useState<
    Record<string, Record<string, AgentTabState>>
  >({});
  const [view, setView] = useState<DemoView>("project");
  const [jobs, setJobs] = useState<DemoJob[]>(seedJobs);
  const [usageSettings, setUsageSettings] = useState<UsageSidebarSettings>(
    DEFAULT_USAGE_SETTINGS,
  );
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<DemoNotice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set(seedProjects[0] ? [seedProjects[0].name] : []),
  );
  const [autoCursor, setAutoCursor] = useState<AutoCursorState>({
    phase: "hidden",
  });
  const [hint, setHint] = useState<{ text: TourHint; stage: HintStage }>({
    text: tour.hint,
    stage: "invite",
  });
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
  const tourPromptsRef = useRef(tourPromptsFor(undefined));
  // Stamped once when the demo mounts, so the seeded sessions all date from
  // the same moment rather than drifting apart as the tree re-renders.
  const [mountedAt] = useState(() => Date.now());
  const [tourPlaying, setTourPlaying] = useState(false);
  const [tourStage, setTourStage] = useState(0);
  // Lets a step clicked in the list stop the mimed tour mid-flight, so the
  // click it was about to land does not double the visitor's.
  const tourCancelRef = useRef<(() => void) | null>(null);
  // Read when the tour arms rather than on every render: a page hands the same
  // tour in for the life of the frame, and re-arming on it would end the tour.
  const tourConfigRef = useRef(tour);
  // Whether a project has been added this visit, whoever did it. A ref so the
  // tour can read it the moment it happens, ahead of the render.
  const addedProjectRef = useRef(false);
  const addProjectNowRef = useRef<((folder: string) => DemoProject) | null>(
    null,
  );
  const mountedRef = useRef(true);

  useEffect(() => {
    tourConfigRef.current = tour;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const markInteracted = () => {
    setAutoCursor({ phase: "hidden" });
    setHintVisible(false);
  };

  useEffect(() => {
    servicesRunningRef.current = (runningByProject[selected]?.size ?? 0) > 0;
  }, [runningByProject, selected]);

  // The step list counts what has happened in the window, whoever did it: a
  // visitor pressing the buttons advances it the same as the tour does. It
  // only moves forward — stopping a project again is not unlearning Start.
  // An open session and a session that has been given a prompt are separate
  // steps, so the count reads the panes rather than the status map alone: an
  // agent waiting on its first prompt reports no status at all. A step counts
  // once its earlier steps have, so the list never shows a later step done
  // with an earlier one still pending.
  useEffect(() => {
    const done: Record<TourStepId, boolean> = {
      addProject: addedProjectRef.current,
      start: false,
      agent: false,
      prompt: false,
      codex: false,
      codexPrompt: false,
    };
    for (const p of projects) {
      const terminals = actionTerminalsByProject[p.name] ?? EMPTY_ACTIONS;
      const statuses = agentTabStatusByProject[p.name] ?? EMPTY_STATUS;
      const open = new Set<string>();
      const asked = new Set<string>();
      for (const leaf of collectLeaves(treeByProject[p.name] ?? null)) {
        for (const tab of leaf.tabs) {
          if (tab.kind !== "action") continue;
          const agent = terminals[tab.key]?.agent;
          if (!agent) continue;
          open.add(agent);
          if (statuses[tabKey(tab)]) asked.add(agent);
        }
      }
      done.start ||= (runningByProject[p.name]?.size ?? 0) > 0;
      done.agent ||= open.size > 0;
      done.prompt ||= asked.size > 0;
      done.codex ||= open.size > 1;
      done.codexPrompt ||= asked.size > 1;
    }
    const pending = tour.steps.findIndex((s) => !done[s.id]);
    const reached = pending === -1 ? tour.steps.length : pending;
    setTourStage((cur) => Math.max(cur, reached));
  }, [
    tour,
    projects,
    runningByProject,
    treeByProject,
    actionTerminalsByProject,
    agentTabStatusByProject,
  ]);

  // What the tour types, read at the beat rather than when its effect armed —
  // the visitor may have selected another project in the meantime.
  useEffect(() => {
    tourPromptsRef.current = tourPromptsFor(
      projects.find((p) => p.name === selected) ?? projects[0],
    );
  }, [projects, selected]);

  useEffect(() => {
    onTour?.({ stage: tourStage, playing: tourPlaying });
  }, [onTour, tourStage, tourPlaying]);

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

    // Nothing to tour without a project on screen.
    if (!startButtonRef.current) return;
    autoCursorRanRef.current = true;

    const { steps } = tourConfigRef.current;
    let driveWaits: (() => void)[] = [];
    const ctx: TourContext = {
      container,
      startButton: () => startButtonRef.current,
      chip: (agent) =>
        agent === "claude" ? agentButtonRef.current : codexButtonRef.current,
      servicesRunning: () => servicesRunningRef.current,
      prompts: () => tourPromptsRef.current,
      addProject: (folder) => {
        addProjectNowRef.current?.(folder);
      },
      onWait: (cancel) => driveWaits.push(cancel),
      onStepDone: (id) => {
        const text = steps.find((s) => s.id === id)?.hint;
        if (!text) return;
        setHint({ text, stage: "next" });
        setHintVisible(true);
      },
    };
    // The mimed cursor clicks real buttons, and each step presses its control
    // at most once — the moves keep that count between the mime and a landing.
    const plan = steps.map((step) => ({
      step,
      ...tourStepMoves(step.id, ctx),
    }));
    const startEntry = plan.find((entry) => entry.step.id === "start");

    // What the sequence was heading for, landed at once: a visitor who scrolls
    // away or has motion turned down comes back to a finished demo rather than
    // a project half set up.
    const landRemaining = () => {
      for (const entry of plan) entry.land();
    };

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      landRemaining();
      return;
    }

    setTourPlaying(true);
    let cancelled = false;
    let cursorHidden = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
      for (const cancel of driveWaits) cancel();
      driveWaits = [];
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
      setTourPlaying(false);
    };
    tourCancelRef.current = cancel;

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
      !!startButtonRef.current?.parentElement?.contains(node) ||
      (node instanceof Element && !!node.closest('[role="menu"]'));
    // Pressing Start IS the boot, so it latches the step rather than injecting
    // a click: the browser delivers pointerdown and click in separate tasks, so
    // a click here would flip the button to Stop before the visitor's own click
    // lands on it and shut the project straight back down.
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target instanceof Node ? event.target : null;
      if (node && startButtonRef.current?.contains(node)) startEntry?.latch();
      else if (!node || !inStartMenu(node)) startEntry?.land();
      cancel();
    };
    const onKeyDown = () => cancel();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });
    container.addEventListener("keydown", onKeyDown);

    const containerRect = container.getBoundingClientRect();
    // Where on a control the click lands. Re-read every beat: the visitor is
    // usually still scrolling the frame into place, and a stale origin would
    // land the cursor on the wrong control. Nobody hits dead centre, so the
    // point sits a little off it — the same little off it for the tap as for
    // the reach, on every visit — and a text field is clicked where its text
    // starts rather than halfway along it.
    const pointOn = (el: HTMLElement, move: TourMove, seed: string) => {
      const frame = container.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const rng = seededRandom(seed);
      const left = r.left - frame.left;
      const top = r.top - frame.top;
      if (move.anchor === "start")
        return {
          x: left + 18 + rng() * 12,
          y: top + r.height / 2 + (rng() - 0.5) * r.height * 0.3,
        };
      const play = Math.min(r.width, r.height) * 0.3;
      return {
        x: left + r.width / 2 + (rng() - 0.5) * play,
        y: top + r.height / 2 + (rng() - 0.5) * play,
      };
    };
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
    // A control can shift as panes open, so every beat re-reads where it is.
    // One that is not on screen leaves the cursor where it was.
    const aim = (move: TourMove, phase: "travel" | "tap", seed: string) => {
      const el = move.target();
      if (!el) return null;
      const point = pointOn(el, move, seed);
      setAutoCursor(
        phase === "travel"
          ? { phase, ...point, withinMs: move.travelMs, seed }
          : { phase, ...point },
      );
      return point;
    };

    // Start rings ahead of the click on it, wherever in the tour that comes.
    if (startEntry) {
      const startMs = startEntry.step.beatMs;
      mime(Math.max(0, startMs - RING_LEAD_MS), () => setRingPulseOn(true));
      mime(startMs + 300, () => setRingPulseOn(false));
    }

    // Every step waits on the one before it long enough for a visitor to watch
    // what that click did — jumping straight on buries the thing it just did.
    let entered = false;
    for (const entry of plan) {
      entry.moves.forEach((move, index) => {
        const seed = `${entry.step.id}:${index}`;
        const clickMs = entry.step.beatMs + move.offsetMs;
        const travelMs = clickMs - move.travelMs;
        if (!entered) {
          entered = true;
          mime(travelMs - 80, () =>
            setAutoCursor({ phase: "travel", ...from, withinMs: 0, seed }),
          );
        }
        mime(travelMs, () => {
          if (move.reveal?.() ?? true) aim(move, "travel", seed);
        });
        step(clickMs, () => {
          const point =
            !cursorHidden && (move.reveal?.() ?? true)
              ? aim(move, "tap", seed)
              : null;
          move.act();
          if (point && move.anchor === "start")
            mime(ASIDE_DELAY_MS, () =>
              setAutoCursor({
                phase: "travel",
                x: point.x + ASIDE_OFFSET.x,
                y: point.y + ASIDE_OFFSET.y,
                withinMs: ASIDE_DELAY_MS * 2,
                seed: `${seed}:aside`,
              }),
            );
        });
      });
    }

    // The cursor stays on the last step until it has visibly happened — for a
    // typed prompt, until the prompt has gone — then fades from wherever it
    // actually is.
    const last = plan[plan.length - 1];
    const endMs = last ? last.step.beatMs + last.tailMs() : 0;
    mime(endMs, () =>
      setAutoCursor((cur) =>
        cur.phase === "hidden" ? cur : { phase: "fade", x: cur.x, y: cur.y },
      ),
    );
    step(endMs + 500, () => {
      if (!cursorHidden) setAutoCursor({ phase: "hidden" });
      setTourPlaying(false);
    });

    return () => {
      // Scrolling away mid-flight would otherwise strand the mimed cursor on
      // screen and abandon the sequence half-done — the effect never re-arms,
      // so the visitor would come back to a project that never got its agent.
      // Skip the remaining animation, but land on the state it was heading
      // for: a moment later, from outside this teardown, so a step that has to
      // render before the next one can. Not for a frame that is going away.
      if (!cancelled)
        window.setTimeout(() => {
          if (mountedRef.current) landRemaining();
        }, 0);
      cancelled = true;
      clearTimers();
      hideCursor();
      tourCancelRef.current = null;
      setTourPlaying(false);
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

  const commitProject = (newProject: DemoProject) => {
    const pane = initialPaneState(newProject);
    addedProjectRef.current = true;
    // The tour may prompt this project in the same task that added it, ahead
    // of the render that would otherwise point it here.
    tourPromptsRef.current = tourPromptsFor(newProject);
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

  // Mirrors the app's adoption notices: a folder that is already a project is
  // opened rather than added twice, and a new one says what was found in it.
  const handleAddProject = (input: NewProjectInput) => {
    const root = `~/Projects/${input.name}`;
    const known =
      input.kind === "local" ? projects.find((p) => p.root === root) : undefined;
    if (known) {
      selectProject(known.name);
      setAdding(false);
      setNotice({
        id: Date.now(),
        tone: "info",
        text: `That folder is already the project “${known.label ?? known.name}”.`,
      });
      return;
    }
    const newProject = buildProjectFromInput(input, projects);
    commitProject(newProject);
    const found = detectionNotice(input, newProject.services);
    setNotice(found ? { id: Date.now(), tone: "success", text: found } : null);
  };

  // Adopts a folder the way the picker would, rendered before it returns so
  // that a click straight after finds the new project's controls rather than
  // the old one's.
  const addProjectNow = (folder: string): DemoProject => {
    const input: NewProjectInput = { kind: "local", name: folder };
    const newProject = buildProjectFromInput(input, projects);
    flushSync(() => commitProject(newProject));
    const found = detectionNotice(input, newProject.services);
    if (found) setNotice({ id: Date.now(), tone: "success", text: found });
    return newProject;
  };
  useEffect(() => {
    addProjectNowRef.current = addProjectNow;
  });

  // A step clicked in the list runs everything up to it, so the list never
  // shows a later step done with an earlier one still pending. Each control is
  // pressed at most once: Start is a toggle, and a second click on an agent
  // chip would open a duplicate tab.
  useImperativeHandle(tourRef, () => ({
    run: (id: TourStepId) => {
      autoCursorRanRef.current = true;
      tourCancelRef.current?.();
      markInteracted();
      if (!project) return;
      // Adding a project moves the run onto it; every step after works there.
      let target = project;
      const hasTab = (agent: "claude" | "codex") => {
        const terminals = actionTerminalsByProject[target.name] ?? EMPTY_ACTIONS;
        return collectLeaves(treeByProject[target.name] ?? null).some((leaf) =>
          leaf.tabs.some(
            (t) => t.kind === "action" && terminals[t.key]?.agent === agent,
          ),
        );
      };
      // The chip above may have opened the tab in this same click, so the
      // prompt waits for the session rather than for the next render.
      const promptTab = (agent: "claude" | "codex") => {
        const text =
          target.actions.find((a) => a.agent === agent)?.autoPrompt ??
          TOUR_FALLBACK_PROMPT;
        withAgentDrive(agentDriveKey(target.name, agent), (drive) => {
          if (drive.idle()) drive.send(text);
        });
      };
      const upTo = tour.steps.findIndex((s) => s.id === id);
      for (const step of tour.steps.slice(0, upTo + 1)) {
        switch (step.id) {
          case "addProject":
            if (!addedProjectRef.current)
              target = addProjectNow(TOUR_NEW_PROJECT_FOLDER);
            break;
          case "start":
            if (!runningByProject[target.name]?.size)
              startButtonRef.current?.click();
            break;
          case "agent":
            if (!hasTab("claude")) agentButtonRef.current?.click();
            break;
          case "prompt":
            promptTab("claude");
            break;
          case "codex":
            if (!hasTab("codex")) codexButtonRef.current?.click();
            break;
          case "codexPrompt":
            promptTab("codex");
            break;
        }
      }
    },
  }));

  // A pill that never leaves reads as chrome rather than a prompt. The clock
  // only runs while the frame is parked in the viewport, so its whole life is
  // not spent under the fold.
  useEffect(() => {
    if (!hintVisible || !isParked) return;
    const id = window.setTimeout(
      () => setHintVisible(false),
      hint.stage === "next" ? 8000 : 12000,
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
        <DemoToast notice={notice} onDismiss={dismissNotice} />
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

        {/* Above every overlay in the frame: the cursor stands in for the
          visitor, and the picker it clicks through would otherwise hide it. */}
        <AutoCursor state={autoCursor} />

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
            <span className="sm:hidden">{hint.text.short}</span>
            <span className="hidden sm:inline">{hint.text.long}</span>
          </div>
        </div>
      </div>
    </DemoActiveProvider>
  );
}
