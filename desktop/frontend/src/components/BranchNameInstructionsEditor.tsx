import { ReadBranchNameInstructions, SaveBranchNameInstructions } from "../../bridge/commands";
import { InstructionsEditor } from "./InstructionsEditor";
import { DEFAULT_BRANCH_NAME_INSTRUCTIONS, withDefault } from "../aiInstructions";

const load = withDefault(ReadBranchNameInstructions, DEFAULT_BRANCH_NAME_INSTRUCTIONS);

export function BranchNameInstructionsEditor({ onBack }: { onBack: () => void }) {
  return (
    <InstructionsEditor
      title="Branch Name Instructions"
      description="Custom instructions for AI-generated branch names. Applied globally to all projects."
      placeholder={DEFAULT_BRANCH_NAME_INSTRUCTIONS}
      load={load}
      save={SaveBranchNameInstructions}
      onBack={onBack}
    />
  );
}
