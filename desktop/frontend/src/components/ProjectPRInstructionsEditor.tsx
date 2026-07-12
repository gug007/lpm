import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { PRInstructionsForm } from "./PRInstructionsForm";
import { ChevronLeftIcon } from "./icons";

export function ProjectPRInstructionsEditor({
  projectName,
  onBack,
}: {
  projectName: string;
  onBack: () => void;
}) {
  const titleLoad = useCallback(
    () => ReadProjectInstructions(projectName, "pr-title"),
    [projectName],
  );
  const titleSave = useCallback(
    (content: string) => SaveProjectInstructions(projectName, "pr-title", content),
    [projectName],
  );
  const descLoad = useCallback(
    () => ReadProjectInstructions(projectName, "pr-description"),
    [projectName],
  );
  const descSave = useCallback(
    (content: string) =>
      SaveProjectInstructions(projectName, "pr-description", content),
    [projectName],
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
