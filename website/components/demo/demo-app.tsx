"use client";

import { useMemo, useState } from "react";
import PROJECTS from "./projects";
import { DemoSidebar } from "./sidebar";
import { DemoProjectView } from "./project-view";

type DemoAppProps = {
  heightCss?: string;
};

export function DemoApp({ heightCss }: DemoAppProps) {
  const [selected, setSelected] = useState<string>(PROJECTS[0].name);
  const [runningByProject, setRunningByProject] = useState<
    Record<string, Set<string>>
  >(() => Object.fromEntries(PROJECTS.map((p) => [p.name, new Set()])));

  const project = useMemo(
    () => PROJECTS.find((p) => p.name === selected) ?? PROJECTS[0],
    [selected],
  );

  const runningHere = runningByProject[project.name];

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
      />
    </div>
  );
}
