import { GitBranch } from "lucide-react";
import { InstructionsEditor } from "./InstructionsEditor";
import type { MachineScope } from "./settings/machineCommands";
import { instructionsScope, useMachineInstructions } from "./settings/useMachineInstructions";
import { DEFAULT_BRANCH_NAME_INSTRUCTIONS } from "../aiInstructions";

export function BranchNameInstructionsEditor({
  machine,
  onBack,
  backTitle,
}: {
  machine: MachineScope;
  onBack: () => void;
  backTitle?: string;
}) {
  const { load, save } = useMachineInstructions(machine.commands, "branchName", DEFAULT_BRANCH_NAME_INSTRUCTIONS);
  return (
    <InstructionsEditor
      icon={GitBranch}
      title="Branch name instructions"
      description={`How AI names new branches. ${instructionsScope(machine.name)}`}
      defaultText={DEFAULT_BRANCH_NAME_INSTRUCTIONS}
      load={load}
      save={save}
      onBack={onBack}
      backTitle={backTitle}
    />
  );
}
