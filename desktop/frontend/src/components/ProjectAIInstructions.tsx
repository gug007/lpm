import { useState, type ComponentType } from "react";
import { ChevronLeftIcon } from "./icons";
import { ProjectCommitInstructionsEditor } from "./ProjectCommitInstructionsEditor";
import { ProjectPRInstructionsEditor } from "./ProjectPRInstructionsEditor";
import { ProjectBranchNameInstructionsEditor } from "./ProjectBranchNameInstructionsEditor";
import { BTN_SECONDARY } from "./ui/buttons";

// Optional read/write overrides for the per-key instruction files. Defaults to
// the local ReadProjectInstructions/SaveProjectInstructions bridge commands; the
// remote view injects a peer-backed pair so the same editors edit the other Mac.
export interface InstructionsEditorIO {
  read?: (project: string, key: string) => Promise<string>;
  write?: (project: string, key: string, content: string) => Promise<void>;
}

interface Section {
  id: string;
  label: string;
  description: string;
  Editor: ComponentType<{ projectName: string; onBack: () => void } & InstructionsEditorIO>;
}

const SECTIONS: Section[] = [
  {
    id: "commit",
    label: "Commit Instructions",
    description: "Custom instructions for this project's AI commit messages",
    Editor: ProjectCommitInstructionsEditor,
  },
  {
    id: "pr",
    label: "PR Instructions",
    description: "Custom instructions for this project's AI pull request titles and descriptions",
    Editor: ProjectPRInstructionsEditor,
  },
  {
    id: "branch",
    label: "Branch Name Instructions",
    description: "Custom instructions for this project's AI branch names",
    Editor: ProjectBranchNameInstructionsEditor,
  },
];

export function ProjectAIInstructions({
  projectName,
  onBack,
  read,
  write,
}: {
  projectName: string;
  onBack: () => void;
} & InstructionsEditorIO) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = SECTIONS.find((s) => s.id === activeId);

  if (active) {
    const { Editor } = active;
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6">
        <Editor
          projectName={projectName}
          onBack={() => setActiveId(null)}
          read={read}
          write={write}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Back to terminal"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">AI Instructions</h1>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Set AI instructions just for this project. Leave any blank to use the global default.
      </p>

      <div className="mt-4 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {SECTIONS.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">{s.label}</p>
              <p className="text-[11px] text-[var(--text-muted)]">{s.description}</p>
            </div>
            <div className="shrink-0">
              <button onClick={() => setActiveId(s.id)} className={BTN_SECONDARY}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
