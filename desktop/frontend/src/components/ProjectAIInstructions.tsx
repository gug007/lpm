import { useState, type ComponentType } from "react";
import { Sparkles } from "lucide-react";
import { ProjectCommitInstructionsEditor } from "./ProjectCommitInstructionsEditor";
import { ProjectPRInstructionsEditor } from "./ProjectPRInstructionsEditor";
import { ProjectBranchNameInstructionsEditor } from "./ProjectBranchNameInstructionsEditor";
import { ProjectSubpage } from "./project-detail/ProjectSubpage";
import { BTN_SECONDARY } from "./ui/buttons";
import { CARD_CLASS } from "./ui/fields";
import { StatusChip } from "./ui/StatusChip";
import { Tooltip } from "./ui/Tooltip";
import type { PageBack } from "./ui/PageHeader";
import { useProjectInstructionStates } from "./useProjectInstructionStates";
import { useGlobalInstructionDefaults } from "./useGlobalInstructionDefaults";
import { InstructionPreview } from "./InstructionPreview";
import { isPeerName } from "../peer/markers";
import { useAppStore } from "../store/app";

interface Section {
  id: string;
  label: string;
  description: string;
  keys: string[];
  Editor: ComponentType<{ projectName: string; onBack: () => void }>;
}

const SECTIONS: Section[] = [
  {
    id: "commit",
    label: "Commit instructions",
    description: "How AI writes this project's commit messages",
    keys: ["commit"],
    Editor: ProjectCommitInstructionsEditor,
  },
  {
    id: "pr",
    label: "PR instructions",
    description: "How AI writes this project's pull request titles and descriptions",
    keys: ["pr-title", "pr-description"],
    Editor: ProjectPRInstructionsEditor,
  },
  {
    id: "branch",
    label: "Branch name instructions",
    description: "How AI names this project's branches",
    keys: ["branch-name"],
    Editor: ProjectBranchNameInstructionsEditor,
  },
];

export function ProjectAIInstructions({ projectName, back }: { projectName: string; back: PageBack }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = SECTIONS.find((s) => s.id === activeId);
  const states = useProjectInstructionStates(projectName, SECTIONS, !active);
  // A paired machine's project falls back to that machine's global default,
  // which this Mac can't show or open.
  const local = !isPeerName(projectName);
  const globals = useGlobalInstructionDefaults(SECTIONS, local);
  const openGlobalDefaults = () => useAppStore.getState().openSettingsTab("git");

  if (active) {
    const { Editor } = active;
    return (
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden px-6 pt-6">
        <Editor projectName={projectName} onBack={() => setActiveId(null)} />
      </div>
    );
  }

  return (
    <ProjectSubpage
      back={back}
      title="AI Instructions"
      icon={Sparkles}
      description="How AI writes commits, pull requests and branch names in this project. A section you don't customize follows the global default."
      actions={
        local && (
          <button type="button" onClick={openGlobalDefaults} className={BTN_SECONDARY}>
            Edit global defaults
          </button>
        )
      }
    >
      <div className={`divide-y divide-[var(--border)] ${CARD_CLASS}`}>
        {SECTIONS.map((s) => {
          const state = states[s.id];
          const preview = state?.custom ? state.text : globals[s.id];
          return (
            <div key={s.id} className="flex items-start justify-between gap-6 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">{s.label}</p>
                  {state && (
                    <StatusChip tone={state.custom ? "success" : "neutral"}>
                      {state.custom ? "Custom" : "Global default"}
                    </StatusChip>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">{s.description}</p>
                {preview && <InstructionPreview text={preview} />}
              </div>
              {state && !state.custom ? (
                <Tooltip content="Starts from the global default" side="left">
                  <button onClick={() => setActiveId(s.id)} className={`${BTN_SECONDARY} shrink-0`}>
                    Customize
                  </button>
                </Tooltip>
              ) : (
                <button onClick={() => setActiveId(s.id)} className={`${BTN_SECONDARY} shrink-0`}>
                  Edit
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ProjectSubpage>
  );
}
