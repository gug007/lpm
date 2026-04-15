import { ReadBranchNameInstructions, SaveBranchNameInstructions } from "../../wailsjs/go/main/App";
import { InstructionsEditor } from "./InstructionsEditor";

export function BranchNameInstructionsEditor({ onBack }: { onBack: () => void }) {
  return (
    <InstructionsEditor
      title="Branch Name Instructions"
      description="Custom instructions for AI-generated branch names. Applied globally to all projects."
      placeholder={"Use kebab-case (lowercase words separated by hyphens).\nKeep under 50 characters.\nOptionally prefix with a type: feat/, fix/, refactor/, docs/, chore/.\nBe descriptive but concise.\nOutput ONLY the branch name. No code fences. No explanation."}
      load={ReadBranchNameInstructions}
      save={SaveBranchNameInstructions}
      onBack={onBack}
    />
  );
}
