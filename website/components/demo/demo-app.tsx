"use client";

import { useMemo, useState } from "react";
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
};

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

export function DemoApp({ heightCss }: DemoAppProps) {
  const [projects, setProjects] = useState<DemoProject[]>(INITIAL_PROJECTS);
  const [selected, setSelected] = useState<string>(INITIAL_PROJECTS[0].name);
  const [runningByProject, setRunningByProject] = useState<
    Record<string, Set<string>>
  >(() => Object.fromEntries(INITIAL_PROJECTS.map((p) => [p.name, new Set()])));
  const [gitByProject, setGitByProject] = useState<Record<string, DemoGit>>(
    () => initialGitState(INITIAL_PROJECTS),
  );
  const [adding, setAdding] = useState(false);

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
      className="relative flex overflow-hidden rounded-xl border border-gray-200 dark:border-[#2e2e2e] shadow-2xl shadow-gray-200/60 dark:shadow-black/60 bg-[#1a1a1a]"
      style={{ height: heightCss ?? "min(640px, calc(100vh - 180px))" }}
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
      />
      <DemoAddProjectModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreate={handleAddProject}
      />
    </div>
  );
}
