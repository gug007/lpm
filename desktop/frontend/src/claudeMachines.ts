import type { MachineClaudeAccounts } from "./peer/hostClaude";

export interface SharingMachine {
  slug: string;
  alias: string;
  claude: MachineClaudeAccounts;
}

// The connected machines that share their Claude accounts; one too old to, or
// not read yet, is left out.
export function sharingMachines(
  aliases: Record<string, string>,
  machines: Record<string, MachineClaudeAccounts>,
): SharingMachine[] {
  return Object.entries(aliases).flatMap(([slug, alias]) => {
    const claude = machines[slug];
    return claude ? [{ slug, alias, claude }] : [];
  });
}
