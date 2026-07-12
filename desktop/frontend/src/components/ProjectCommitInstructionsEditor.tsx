import { useCallback } from "react";
import {
  ReadProjectInstructions,
  SaveProjectInstructions,
} from "../../bridge/commands";
import { InstructionsEditor } from "./InstructionsEditor";
import { DEFAULT_COMMIT_INSTRUCTIONS } from "../aiInstructions";

export function ProjectCommitInstructionsEditor({
  projectName,
  onBack,
}: {
  projectName: string;
  onBack: () => void;
}) {
  const load = useCallback(
    () => ReadProjectInstructions(projectName, "commit"),
    [projectName],
  );
  const save = useCallback(
    (content: string) => SaveProjectInstructions(projectName, "commit", content),
    [projectName],
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
