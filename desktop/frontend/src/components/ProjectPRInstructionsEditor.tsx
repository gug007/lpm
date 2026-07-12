import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { PRInstructionsForm } from "./PRInstructionsForm";
import { ChevronLeftIcon } from "./icons";
import type { InstructionsEditorIO } from "./ProjectAIInstructions";

export function ProjectPRInstructionsEditor({
  projectName,
  onBack,
  read = ReadProjectInstructions,
  write = SaveProjectInstructions,
}: {
  projectName: string;
  onBack: () => void;
} & InstructionsEditorIO) {
  const titleLoad = useCallback(
    () => read(projectName, "pr-title"),
    [projectName, read],
  );
  const titleSave = useCallback(
    (content: string) => write(projectName, "pr-title", content),
    [projectName, write],
  );
  const descLoad = useCallback(
    () => read(projectName, "pr-description"),
    [projectName, read],
  );
  const descSave = useCallback(
    (content: string) => write(projectName, "pr-description", content),
    [projectName, write],
  );

  return (
    <div className="flex flex-1 flex-col pt-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Back to AI Instructions"
        >
          <ChevronLeftIcon />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">PR Instructions</h1>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
        Custom instructions for this project's AI pull request titles and descriptions. Leave blank to use the global default.
      </p>

      <PRInstructionsForm
        titleLoad={titleLoad}
        titleSave={titleSave}
        descLoad={descLoad}
        descSave={descSave}
      />
    </div>
  );
}
