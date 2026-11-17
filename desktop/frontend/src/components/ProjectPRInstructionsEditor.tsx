import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { PRInstructionsForm } from "./PRInstructionsForm";
import { PageHeader } from "./ui/PageHeader";

export function ProjectPRInstructionsEditor({
  projectName,
  onBack,
  backTitle = "AI instructions",
}: {
  projectName: string;
  onBack: () => void;
  backTitle?: string;
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
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="PR instructions"
        description="Custom instructions for this project's AI pull request titles and descriptions. Leave blank to use the global default."
        back={{ label: backTitle, onClick: onBack }}
      />

      <PRInstructionsForm
        titleLoad={titleLoad}
        titleSave={titleSave}
        descLoad={descLoad}
        descSave={descSave}
        resetClears
      />
    </div>
  );
}
