import { resetText } from "./components/stats/limitsFormat";
import { useAccountsStore } from "./store/accounts";
import type { ClaudePool, PoolSkip } from "./store/claudePool";

export const MAIN_LOGIN = "default";

export function accountLabel(id: string, pool?: ClaudePool | null): string {
  if (id === MAIN_LOGIN) return "Main login";
  const account = useAccountsStore.getState().accounts.find((a) => a.id === id);
  if (account) return account.label;
  return pool?.accounts.find((a) => a.id === id)?.email || "Removed account";
}

function windowName(window: "fiveHour" | "weekly" | null): string {
  if (window === "fiveHour") return "5-hour limit";
  if (window === "weekly") return "weekly limit";
  return "usage limit";
}

function withReset(text: string, resetsAt: number, now: number): string {
  const reset = resetText(resetsAt, now);
  return reset ? `${text}, ${reset}` : text;
}

/** Why an account was passed over, as one sentence without a full stop. */
export function skipSentence(
  id: string,
  skip: PoolSkip,
  pool?: ClaudePool | null,
  now = Date.now(),
): string {
  const name = accountLabel(id, pool);
  switch (skip.kind) {
    case "signedOut":
      return `${name} is signed out`;
    case "sameAccount":
      return `${name} is signed in as the same Claude account as ${accountLabel(skip.as, pool)}`;
    case "notAllowed":
      return `${name} is a team or work seat you haven't allowed`;
    case "unconfirmed":
      return `${name} isn't confirmed as yours yet`;
    case "onHold":
      return `${name} is on hold`;
    case "hit":
      return withReset(`${name} hit its ${windowName(skip.window)}`, skip.resetsAt, now);
    case "near":
      return withReset(
        `${name} is at ${Math.round(skip.percent)}% of its ${windowName(skip.window)}`,
        skip.resetsAt,
        now,
      );
  }
}

/** A short status for an account row, from why the picker skipped it. */
export function skipChip(skip: PoolSkip, now = Date.now()): { text: string; tone: "red" | "amber" | "muted" } {
  switch (skip.kind) {
    case "signedOut":
      return { text: "Signed out", tone: "muted" };
    case "sameAccount":
      return { text: "Same account", tone: "muted" };
    case "notAllowed":
      return { text: "Not allowed", tone: "muted" };
    case "unconfirmed":
      return { text: "Not confirmed", tone: "muted" };
    case "onHold":
      return { text: "On hold", tone: "red" };
    case "hit":
      return { text: withReset("Limit hit", skip.resetsAt, now), tone: "red" };
    case "near":
      return { text: withReset(`${Math.round(skip.percent)}% used`, skip.resetsAt, now), tone: "amber" };
  }
}
