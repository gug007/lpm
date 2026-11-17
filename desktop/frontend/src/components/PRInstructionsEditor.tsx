import { GitPullRequest } from "lucide-react";
import { PRInstructionsForm } from "./PRInstructionsForm";
import { PageHeader } from "./ui/PageHeader";
import type { MachineScope } from "./settings/machineCommands";
import { instructionsScope, useMachineInstructions } from "./settings/useMachineInstructions";
import { DEFAULT_PR_TITLE_INSTRUCTIONS, DEFAULT_PR_DESCRIPTION_INSTRUCTIONS } from "../aiInstructions";

export function PRInstructionsEditor({
  machine,
  onBack,
  backTitle = "Settings",
}: {
  machine: MachineScope;
  onBack: () => void;
  backTitle?: string;
}) {
  const title = useMachineInstructions(machine.commands, "prTitle", DEFAULT_PR_TITLE_INSTRUCTIONS);
  const description = useMachineInstructions(
    machine.commands,
    "prDescription",
    DEFAULT_PR_DESCRIPTION_INSTRUCTIONS,
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        icon={GitPullRequest}
        title="PR instructions"
        description={`How AI writes pull request titles and descriptions. ${instructionsScope(machine.name)}`}
        back={{ label: backTitle, onClick: onBack }}
      />

      <PRInstructionsForm
        titleLoad={title.load}
        titleSave={title.save}
        descLoad={description.load}
        descSave={description.save}
      />
    </div>
  );
}
