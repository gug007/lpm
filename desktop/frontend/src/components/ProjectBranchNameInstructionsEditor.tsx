import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { InstructionsEditor } from "./InstructionsEditor";
import { DEFAULT_BRANCH_NAME_INSTRUCTIONS } from "../aiInstructions";

export function ProjectBranchNameInstructionsEditor({
  projectName,
  onBack,
}: {
  projectName: string;
  onBack: () => void;
}) {
  const load = useCallback(
    () => ReadProjectInstructions(projectName, "branch-name"),
    [projectName],
  );
  const save = useCallback(
    (content: string) =>
      SaveProjectInstructions(projectName, "branch-name", content),
    [projectName],
  );

  return (
    <InstructionsEditor
      title="Branch Name Instructions"
      description="Custom instructions for this project's AI branch names. Leave blank to use the global default."
      placeholder={DEFAULT_BRANCH_NAME_INSTRUCTIONS}
      load={load}
      save={save}
      onBack={onBack}
    />
  );
}
