import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { InstructionsEditor } from "./InstructionsEditor";
import { DEFAULT_BRANCH_NAME_INSTRUCTIONS } from "../aiInstructions";
import type { InstructionsEditorIO } from "./ProjectAIInstructions";

export function ProjectBranchNameInstructionsEditor({
  projectName,
  onBack,
  read = ReadProjectInstructions,
  write = SaveProjectInstructions,
}: {
  projectName: string;
  onBack: () => void;
} & InstructionsEditorIO) {
  const load = useCallback(
    () => read(projectName, "branch-name"),
    [projectName, read],
  );
  const save = useCallback(
    (content: string) => write(projectName, "branch-name", content),
    [projectName, write],
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
