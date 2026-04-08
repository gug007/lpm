import { ReadCommitInstructions, SaveCommitInstructions } from "../../wailsjs/go/main/App";
import { InstructionsEditor } from "./InstructionsEditor";

export function CommitInstructionsEditor({ onBack }: { onBack: () => void }) {
  return (
    <InstructionsEditor
      title="Commit Instructions"
      description="Custom instructions for AI-generated commit messages. Applied globally to all projects."
      placeholder={"Use conventional commit format: type(scope): description\nTypes: feat, fix, refactor, docs, test, chore, style, perf\nKeep the first line under 72 characters.\nIf needed, add a blank line then a brief body paragraph.\nOutput ONLY the commit message text. No code fences. No explanation."}
      load={ReadCommitInstructions}
      save={SaveCommitInstructions}
      onBack={onBack}
    />
  );
}
