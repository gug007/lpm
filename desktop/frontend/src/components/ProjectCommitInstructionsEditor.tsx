import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { InstructionsEditor } from "./InstructionsEditor";
import { DEFAULT_COMMIT_INSTRUCTIONS } from "../aiInstructions";
import type { InstructionsEditorIO } from "./ProjectAIInstructions";

export function ProjectCommitInstructionsEditor({
  projectName,
  onBack,
  read = ReadProjectInstructions,
  write = SaveProjectInstructions,
}: {
  projectName: string;
  onBack: () => void;
} & InstructionsEditorIO) {
  const load = useCallback(
    () => read(projectName, "commit"),
    [projectName, read],
  );
  const save = useCallback(
    (content: string) => write(projectName, "commit", content),
    [projectName, write],
  );

  return (
    <InstructionsEditor
      title="Commit Instructions"
      description="Custom instructions for this project's AI commit messages. Leave blank to use the global default."
      placeholder={DEFAULT_COMMIT_INSTRUCTIONS}
      load={load}
      save={save}
      onBack={onBack}
    />
  );
}
