import type { ClaudeAccount } from "./types";
import type { ClaudeAccountStatus } from "./store/accounts";

export interface ClaudeSetupProgress {
  completion: [boolean, boolean, boolean];
  currentStep: number;
  allComplete: boolean;
}

export function deriveClaudeSetupSteps(
  accounts: ClaudeAccount[],
  statuses: Record<string, ClaudeAccountStatus>,
  usage: Record<string, string[]>,
): ClaudeSetupProgress {
  const hasAccount = accounts.length > 0;
  const hasSignedIn = accounts.some((a) => statuses[a.id]?.signedIn ?? false);
  const hasAssignment = accounts.some((a) => (usage[a.id]?.length ?? 0) > 0);

  const completion: [boolean, boolean, boolean] = [hasAccount, hasSignedIn, hasAssignment];
  const currentStep = completion.findIndex((done) => !done);

  return {
    completion,
    currentStep,
    allComplete: currentStep === -1,
  };
}
