import { ReadCommitInstructions, SaveCommitInstructions } from "../../bridge/commands";
import { InstructionsEditor } from "./InstructionsEditor";
import { DEFAULT_COMMIT_INSTRUCTIONS, withDefault } from "../aiInstructions";

const load = withDefault(ReadCommitInstructions, DEFAULT_COMMIT_INSTRUCTIONS);

export function CommitInstructionsEditor({ onBack }: { onBack: () => void }) {
  return (
    <InstructionsEditor
      title="Commit Instructions"
      description="Custom instructions for AI-generated commit messages. Applied globally to all projects."
      placeholder={DEFAULT_COMMIT_INSTRUCTIONS}
      load={load}
      save={SaveCommitInstructions}
      onBack={onBack}
    />
  );
}
