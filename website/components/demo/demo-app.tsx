"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2 } from "lucide-react";
import INITIAL_PROJECTS, {
  type DemoBranch,
  type DemoGit,
  type DemoProject,
} from "./projects";
import { DemoSidebar } from "./sidebar";
import { DemoProjectView } from "./project-view";
import {
  DemoAddProjectModal,
  type NewProjectInput,
} from "./add-project-modal";

type DemoAppProps = {
  heightCss?: string;
  heightCssSm?: string;
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

function uniqueName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
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
  const [adding, setAdding] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [autoCursor, setAutoCursor] = useState<AutoCursorState>({
    phase: "hidden",
  });
  const [ringPulseOn, setRingPulseOn] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [glowActive, setGlowActive] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const autoCursorRanRef = useRef(false);
  const interactedRef = useRef(false);
  const hasBeenSeenRef = useRef(false);

  const markInteracted = () => {
    interactedRef.current = true;
    if (!hasInteracted) setHasInteracted(true);
    setAutoCursor({ phase: "hidden" });
    setRingPulseOn(false);
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
    setGlowActive(true);
    const timeout = window.setTimeout(() => setGlowActive(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [isInView]);

  useEffect(() => {
    if (!isInView || autoCursorRanRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    if (typeof window === "undefined") return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      autoCursorRanRef.current = true;
      return;
    }

    const startBtn = startButtonRef.current;
    if (!startBtn) return;
    autoCursorRanRef.current = true;

    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
    };

    const abort = () => {
      if (cancelled) return;
      cancelled = true;
      clearTimers();
      setAutoCursor({ phase: "hidden" });
      setRingPulseOn(false);
    };

    const onPointerMove = () => abort();
    const onPointerDown = () => abort();
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown, { passive: true });

    const containerRect = container.getBoundingClientRect();
    const btnRect = startBtn.getBoundingClientRect();
    const targetX = btnRect.left + btnRect.width / 2 - containerRect.left;
    const targetY = btnRect.top + btnRect.height / 2 - containerRect.top;
    const startX = containerRect.width * 0.45;
    const startY = containerRect.height * 0.65;

    setRingPulseOn(true);

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setAutoCursor({ phase: "travel", x: startX, y: startY });
      }, 600),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setAutoCursor({ phase: "travel", x: targetX, y: targetY });
      }, 680),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setAutoCursor({ phase: "tap", x: targetX, y: targetY });
      }, 1700),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setAutoCursor({ phase: "fade", x: targetX, y: targetY });
        setRingPulseOn(false);
        if (!interactedRef.current) {
          interactedRef.current = true;
          setHasInteracted(true);
        }
      }, 2150),
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setAutoCursor({ phase: "hidden" });
      }, 2600),
    );

    return () => {
      cancelled = true;
      clearTimers();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isInView]);

  const project = useMemo(
    () => projects.find((p) => p.name === selected) ?? projects[0],
    [projects, selected],
  );

  const runningHere = runningByProject[project.name];
  const gitHere = gitByProject[project.name];

  const startServices = (names: string[]) => {
    setRunningByProject((prev) => ({
      ...prev,
      [project.name]: new Set(
        names.filter((n) => project.services.some((s) => s.name === n)),
      ),
    }));
  };

  const stopAll = () => {
    setRunningByProject((prev) => ({
      ...prev,
      [project.name]: new Set(),
    }));
  };

  const toggleService = (name: string) => {
    setRunningByProject((prev) => {
      const next = new Set(prev[project.name]);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...prev, [project.name]: next };
    });
  };

  const updateGit = (mutate: (g: DemoGit) => DemoGit) => {
    setGitByProject((prev) => {
      const cur = prev[project.name];
      if (!cur) return prev;
      return { ...prev, [project.name]: mutate(cur) };
    });
  };

  const handleCheckout = (b: DemoBranch) => {
    updateGit((g) => {
      const hasLocal = g.branches.some((x) => !x.remote && x.name === b.name);
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
    });
  };

  const handleCommit = () => {
    updateGit((g) =>
      g.uncommitted === 0 ? g : { ...g, uncommitted: 0, ahead: g.ahead + 1 },
    );
  };

  const handlePull = () => {
    updateGit((g) => ({ ...g, behind: 0 }));
  };

  const handleCreatePR = () => {
    updateGit((g) => (g.ahead === 0 ? g : { ...g, ahead: 0 }));
  };

  const handleDiscard = () => {
    updateGit((g) => ({ ...g, uncommitted: 0 }));
  };

  const handleSync = () => {
    updateGit((g) => ({ ...g, ahead: 0, behind: 0 }));
  };

  const handleCreateBranch = (name: string) => {
    updateGit((g) => ({
      ...g,
      branch: name,
      uncommitted: 0,
      ahead: 0,
      behind: 0,
      branches: [{ name, age: "now" }, ...g.branches],
    }));
  };

  const handleRenameBranch = (oldName: string, newName: string) => {
    updateGit((g) => ({
      ...g,
      branch: g.branch === oldName ? newName : g.branch,
      branches: g.branches.map((b) =>
        !b.remote && b.name === oldName ? { ...b, name: newName } : b,
      ),
    }));
  };

  const handleDeleteBranch = (name: string) => {
    updateGit((g) => ({
      ...g,
      branches: g.branches.filter((b) => b.remote || b.name !== name),
    }));
  };

  const handleAddProject = (input: NewProjectInput) => {
    const newProject = buildProjectFromInput(input, projects);
    setProjects((prev) => [...prev, newProject]);
    setRunningByProject((prev) => ({ ...prev, [newProject.name]: new Set() }));
    setSelected(newProject.name);
    setAdding(false);
  };

  return (
    <div
      ref={containerRef}
      onPointerDownCapture={markInteracted}
      className={`relative flex overflow-hidden rounded-xl border border-gray-200 dark:border-[#2e2e2e] shadow-2xl shadow-gray-200/60 dark:shadow-black/60 bg-[#1a1a1a] h-[var(--demo-h)] sm:h-[var(--demo-h-sm)] transition-[box-shadow] duration-700 ${
        glowActive ? "ring-2 ring-indigo-500/30" : "ring-0 ring-transparent"
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
        onSelect={setSelected}
        runningByProject={runningByProject}
        onAddProject={() => setAdding(true)}
      />
      <DemoProjectView
        key={project.name}
        project={project}
        runningServices={runningHere}
        onStartServices={startServices}
        onStopAll={stopAll}
        onToggleService={toggleService}
        git={gitHere}
        onGitCheckout={handleCheckout}
        onGitCommit={handleCommit}
        onGitPull={handlePull}
        onGitCreatePR={handleCreatePR}
        onGitDiscard={handleDiscard}
        onGitSync={handleSync}
        onGitCreateBranch={handleCreateBranch}
        onGitRenameBranch={handleRenameBranch}
        onGitDeleteBranch={handleDeleteBranch}
        startButtonRef={startButtonRef}
        startRingPulse={ringPulseOn && !hasInteracted}
      />
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
        aria-hidden={hasInteracted || !isInView}
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 sm:pb-6 transition-all duration-500 ${
          hasInteracted || !isInView
            ? "translate-y-2 opacity-0"
            : "translate-y-0 opacity-100 motion-safe:animate-bounce-soft"
        }`}
      >
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3.5 py-1.5 text-[11px] sm:text-[12px] font-medium text-white shadow-2xl backdrop-blur-md">
          <MousePointer2
            className="h-3.5 w-3.5 text-indigo-300 shrink-0"
            strokeWidth={2.25}
          />
          <span className="sm:hidden">Tap anything — it works</span>
          <span className="hidden sm:inline">
            Yes, this really works. Click anything.
          </span>
        </div>
      </div>
    </div>
  );
}
