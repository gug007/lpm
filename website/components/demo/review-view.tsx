"use client";

import { useState } from "react";
import type { DemoProject } from "./projects";

function ReviewHeader({
  project,
  count,
}: {
  project: DemoProject;
  count: number;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[#2e2e2e] px-3 py-2 text-[11px]">
      <span className="font-medium text-[#e5e5e5]">Changes</span>
      <span className="text-[#8e8e8e]">
        {count === 0 ? "no files" : count === 1 ? "1 file" : `${count} files`}
      </span>
      <span className="ml-auto truncate font-mono text-[10px] text-[#666]">
        {project.root}
      </span>
    </div>
  );
}

const STATUS = {
  modified: { label: "M", color: "text-[#60a5fa]" },
  added: { label: "A", color: "text-[#4ade80]" },
  deleted: { label: "D", color: "text-[#f87171]" },
} as const;

export function ReviewView({ project }: { project: DemoProject }) {
  const [active, setActive] = useState(0);
  const files = project.changedFiles ?? [];
  const file = files[active] ?? files[0];

  if (!file) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
        <ReviewHeader project={project} count={0} />
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <div className="text-[13px] font-medium text-[#b3b3b3]">
            Nothing to review
          </div>
          <p className="font-mono text-[11px] text-[#666]">
            working tree clean
            {project.git ? ` on ${project.git.branch}` : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
      <ReviewHeader project={project} count={files.length} />
      <div className="flex min-h-0 flex-1">
        <div className="w-52 shrink-0 overflow-y-auto border-r border-[#2e2e2e] py-1">
          {files.map((f, i) => {
            const st = STATUS[f.status];
            const name = f.path.split("/").pop();
            const dir = f.path.slice(0, f.path.length - (name?.length ?? 0));
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                  i === active
                    ? "bg-[#2a2a2a] text-[#e5e5e5]"
                    : "text-[#b3b3b3] hover:bg-[#242424]"
                }`}
              >
                <span className={`w-2.5 shrink-0 text-center font-mono font-semibold ${st.color}`}>
                  {st.label}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#8e8e8e]">{dir}</span>
                  {name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="border-b border-[#2e2e2e] px-3 py-1.5 font-mono text-[11px] text-[#b3b3b3]">
            {file.path}
          </div>
          <pre className="px-3 py-2 font-mono text-[11px] leading-[1.6]">
            {file.diff.map((line, i) => {
              const cls =
                line.t === "add"
                  ? "bg-[#4ade80]/10 text-[#86efac]"
                  : line.t === "del"
                    ? "bg-[#f87171]/10 text-[#fca5a5]"
                    : line.t === "hunk"
                      ? "text-[#60a5fa]"
                      : "text-[#8e8e8e]";
              return (
                <div key={i} className={cls}>
                  {line.text || " "}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}
