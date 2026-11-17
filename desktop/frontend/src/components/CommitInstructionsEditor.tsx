import { GitCommitHorizontal } from "lucide-react";
import { InstructionsEditor } from "./InstructionsEditor";
import type { MachineScope } from "./settings/machineCommands";
import { instructionsScope, useMachineInstructions } from "./settings/useMachineInstructions";
import { DEFAULT_COMMIT_INSTRUCTIONS } from "../aiInstructions";

export function CommitInstructionsEditor({
  machine,
  onBack,
  backTitle,
}: {
  machine: MachineScope;
  onBack: () => void;
  backTitle?: string;
}) {
  const { load, save } = useMachineInstructions(machine.commands, "commit", DEFAULT_COMMIT_INSTRUCTIONS);
  return (
    <InstructionsEditor
      icon={GitCommitHorizontal}
      title="Commit instructions"
      description={`How AI writes commit messages. ${instructionsScope(machine.name)}`}
      defaultText={DEFAULT_COMMIT_INSTRUCTIONS}
      load={load}
      save={save}
      onBack={onBack}
      backTitle={backTitle}
    />
  );
}
