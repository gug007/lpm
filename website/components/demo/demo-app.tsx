"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  addTabToLeaf,
  collectLeaves,
  newReviewContent,
  setActiveTab,
  syncServiceTabs,
  tabKey,
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
import {
  HOME_TOUR,
  type CopyMode,
  type Tour,
  type TourHandle,
  type TourHint,
  type TourState,
} from "./tour";
import type { TourPerformers } from "./tour-moves";
import { tourEvent, type TourSnapshot } from "./tour-progress";
import { useDemoTour } from "./use-demo-tour";
import { AutoCursor } from "./auto-cursor";
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
// What a branch is ahead/behind its upstream by. git keeps this per branch, so
// the demo has to park it when a checkout leaves the branch.
type BranchSync = { ahead: number; behind: number };

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
  seedProjects: seedList = INITIAL_PROJECTS,
  seedJobs = INITIAL_JOBS,
}: DemoAppProps) {
  const seedProjects = tour.omitProjects
    ? seedList.filter((p) => !tour.omitProjects?.includes(p.name))
    : seedList;
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
  const [jobs, setJobs] = useState<DemoJob[]>(() =>
    seedJobs.filter((job) => !tour.omitProjects?.includes(job.scope)),
  );
  const [usageSettings, setUsageSettings] = useState<UsageSidebarSettings>(
    DEFAULT_USAGE_SETTINGS,
  );
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<DemoNotice | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set(seedProjects[0] ? [seedProjects[0].name] : []),
  );
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const agentButtonRef = useRef<HTMLButtonElement | null>(null);
  const codexButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasBeenSeenRef = useRef(false);
  // Stamped once when the demo mounts, so the seeded sessions all date from
  // the same moment rather than drifting apart as the tree re-renders.
  const [mountedAt] = useState(() => Date.now());
  // Things that happened and left no state behind to read them off, for the
  // step list to count.
  const [events, setEvents] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const record = useCallback((event: string) => {
    setEvents((prev) => new Map(prev).set(event, (prev.get(event) ?? 0) + 1));
  }, []);
  // The state as of the last commit, for handlers memoized long before it.
  const liveRef = useRef<{
    running: Record<string, Set<string>>;
    events: ReadonlyMap<string, number>;
  }>({ running: {}, events });
  useLayoutEffect(() => {
    liveRef.current = { running: runningByProject, events };
  });


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
    if (name !== selected) record(tourEvent.opened(name));
    showProject(name);
  };

  const showProject = (name: string) => {
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
        // Starting the project answers the "found N services" notice.
        onStartServices: (names: string[]) => {
          setNotice(null);
          setRunningByProject((prev) => ({
            ...prev,
            [name]: new Set(
              names.filter((n) => p.services.some((s) => s.name === n)),
            ),
          }));
        },
        onStopAll: () =>
          setRunningByProject((prev) => ({ ...prev, [name]: new Set() })),
        onToggleService: (svc: string) => {
          // A service switched off and back on is a restart — the only trace
          // it leaves is this.
          const live = liveRef.current;
          if (live.running[name]?.has(svc)) record(tourEvent.stopped(name, svc));
          else if (live.events.has(tourEvent.stopped(name, svc)))
            record(tourEvent.restarted(name, svc));
          setRunningByProject((prev) => {
            const next = new Set(prev[name]);
            if (next.has(svc)) next.delete(svc);
            else next.add(svc);
            return { ...prev, [name]: next };
          });
        },
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
        onGitCommit: () => {
          record(tourEvent.committed(name));
          updateGit((g) =>
            g.uncommitted === 0
              ? g
              : { ...g, uncommitted: 0, ahead: g.ahead + 1 },
          );
        },
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
  }, [projects, record]);

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
  // the other CLI already working in it, and its services up when the ports
  // are free. A worktree copy is the same thing on a branch of its own.
  const handleDuplicate = (name: string, mode: CopyMode) => {
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
              autoDeferred: undefined,
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
    // services its parent runs, their log tabs already in the strip. A parent
    // still running holds the ports, and the app checks them at the door, so
    // that copy waits for its own Start.
    const portsFree = (runningByProject[name]?.size ?? 0) === 0;
    const running = portsFree
      ? (
          source.profiles[0]?.services ?? source.services.map((sv) => sv.name)
        ).filter((svc) => copy.services.some((cs) => cs.name === svc))
      : [];
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
    record(tourEvent.copied(mode));
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

  const commitProject = (newProject: DemoProject, kind: NewProjectInput["kind"]) => {
    const pane = initialPaneState(newProject);
    record(tourEvent.added(kind));
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
    commitProject(newProject, input.kind);
    const found = detectionNotice(input, newProject.services);
    setNotice(found ? { id: Date.now(), tone: "success", text: found } : null);
  };

  // What the tour does when a mimed click cannot finish a step, or when it
  // lands one with nobody watching. Each renders before it returns, so the
  // step after it finds the controls it made.
  const here = project?.name ?? "";
  const performers: TourPerformers = {
    addProject: (input) => {
      const newProject = buildProjectFromInput(input, projects);
      flushSync(() => commitProject(newProject, input.kind));
      const found = detectionNotice(input, newProject.services);
      if (found) setNotice({ id: Date.now(), tone: "success", text: found });
    },
    selectProject: (name) => flushSync(() => selectProject(name)),
    showProject: (name) => flushSync(() => showProject(name)),
    visitProject: (name) =>
      flushSync(() => {
        record(tourEvent.opened(name));
        showProject(name);
      }),
    openAgent: (projectName, agent) => {
      const terminals = actionTerminalsByProject[projectName] ?? EMPTY_ACTIONS;
      const tab = collectLeaves(treeByProject[projectName] ?? null)
        .flatMap((leaf) => leaf.tabs)
        .find((t) => t.kind === "action" && terminals[t.key]?.agent === agent);
      flushSync(() => {
        record(tourEvent.opened(projectName));
        showProject(projectName);
        if (tab)
          setTreeByProject((prev) => ({
            ...prev,
            [projectName]: activateTabByKey(prev[projectName] ?? null, tabKey(tab)),
          }));
      });
    },
    copy: (name, mode) => flushSync(() => handleDuplicate(name, mode)),
    openReview: () =>
      flushSync(() =>
        setTreeByProject((prev) => {
          const tree = prev[here];
          const leaf = collectLeaves(tree ?? null).at(-1);
          if (!tree || !leaf) return prev;
          return {
            ...prev,
            [here]: addTabToLeaf(tree, leaf.id, newReviewContent()),
          };
        }),
      ),
    checkout: (branch) => {
      const git = gitByProject[here];
      const target =
        git?.branches.find((b) => !b.remote && b.name === branch) ??
        git?.branches.find((b) => b.name === branch);
      if (target) flushSync(() => handlers[here]?.onGitCheckout(target));
    },
    commit: () => {
      if (gitByProject[here]?.uncommitted)
        flushSync(() => handlers[here]?.onGitCommit());
    },
    recordAction: (action) => record(tourEvent.ran(here, action)),
  };

  const snapshot: TourSnapshot = useMemo(
    () => ({
      projects,
      selected: here,
      view,
      running: runningByProject,
      trees: treeByProject,
      terminals: actionTerminalsByProject,
      statuses: agentTabStatusByProject,
      git: gitByProject,
      events,
    }),
    [
      projects,
      here,
      view,
      runningByProject,
      treeByProject,
      actionTerminalsByProject,
      agentTabStatusByProject,
      gitByProject,
      events,
    ],
  );

  const showHint = useCallback((text: TourHint) => {
    setHint({ text, stage: "next" });
    setHintVisible(true);
  }, []);
  const hideHint = useCallback(() => setHintVisible(false), []);

  const { autoCursor, ringPulseOn, hideCursor } = useDemoTour({
    tour,
    tourRef,
    onTour,
    containerRef,
    isParked,
    snapshot,
    performers,
    startButtonRef,
    agentButtonRef,
    codexButtonRef,
    onHint: showHint,
    onHintDone: hideHint,
    onInteract: hideHint,
  });

  const markInteracted = () => {
    hideCursor();
    setHintVisible(false);
  };

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

  // A notice in the same corner says more than the pill does, so the pill
  // steps aside while one is up.
  const hidden = !hintVisible || !isParked || notice !== null;
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
            <StatsView omit={tour.omitProjects} />
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
                  data-demo-project={p.name}
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
                    onActionRun={(action) =>
                      record(tourEvent.ran(p.name, action.name))
                    }
                    onShellCommand={(command) =>
                      record(tourEvent.typed(p.name, command))
                    }
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
