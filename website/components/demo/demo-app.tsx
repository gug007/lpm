"use client";

import { useMemo, useState } from "react";
import PROJECTS, { type DemoBranch, type DemoGit } from "./projects";
import { DemoSidebar } from "./sidebar";
import { DemoProjectView } from "./project-view";

type DemoAppProps = {
  heightCss?: string;
};

function initialGitState(): Record<string, DemoGit> {
  const out: Record<string, DemoGit> = {};
  for (const p of PROJECTS) {
    if (p.git) out[p.name] = { ...p.git, branches: [...p.git.branches] };
  }
  return out;
}

export function DemoApp({ heightCss }: DemoAppProps) {
  const [selected, setSelected] = useState<string>(PROJECTS[0].name);
  const [runningByProject, setRunningByProject] = useState<
    Record<string, Set<string>>
  >(() => Object.fromEntries(PROJECTS.map((p) => [p.name, new Set()])));
  const [gitByProject, setGitByProject] = useState<Record<string, DemoGit>>(
    initialGitState,
  );

  const project = useMemo(
    () => PROJECTS.find((p) => p.name === selected) ?? PROJECTS[0],
    [selected],
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
      const branches = b.remote
        ? g.branches.some((x) => !x.remote && x.name === b.name)
          ? g.branches
          : [{ name: b.name, age: "now" }, ...g.branches]
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

  return (
    <div
      className="flex overflow-hidden rounded-xl border border-gray-200 dark:border-[#2e2e2e] shadow-2xl shadow-gray-200/60 dark:shadow-black/60 bg-[#1a1a1a]"
      style={{ height: heightCss ?? "min(640px, calc(100vh - 180px))" }}
    >
      <DemoSidebar
        projects={PROJECTS}
        selected={project.name}
        onSelect={setSelected}
        runningByProject={runningByProject}
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
    </div>
  );
}
