import { toast } from "sonner";
import { GitMerge, GitOriginStatus, GitPush, PullBranch } from "../bridge/commands";
import { DEFAULT_PULL_CONFIG, DEFAULT_PUSH_CONFIG, pullFlags, pushFlags } from "./gitOptions";
import { isPlainPull, originDoneText, originMark, type OriginMark, type OriginStatus } from "./originStatus";
import { useDeckPull } from "./store/deckPull";
import { getSettings } from "./store/settings";
import { useOriginStatus } from "./store/originStatus";

const DONE_MS = 2500;

export async function recheckOrigin(root: string, fetch = false): Promise<void> {
  try {
    const status = (await GitOriginStatus(root, fetch)) as OriginStatus;
    useOriginStatus.getState().setStatus(root, status);
  } catch {
    // A project that can't be checked keeps whatever it last showed.
  }
}

async function catchUp(root: string, mark: OriginMark): Promise<void> {
  const pull = getSettings().gitPull ?? DEFAULT_PULL_CONFIG;
  switch (mark.kind) {
    case "behind":
      await PullBranch(root, pull.strategy, pullFlags(pull));
      return;
    case "diverged": {
      const push = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
      await PullBranch(root, pull.strategy, pullFlags(pull));
      await GitPush(root, pushFlags(push));
      return;
    }
    case "base":
      await GitMerge(root, `origin/${mark.base}`);
      return;
    case "conflict":
      return;
  }
}

// Pull, sync or update the project at `root`, whichever its mark asks for, then
// recount so the row reflects what actually happened. Resolves false only when
// the catch-up itself failed; `name` says which project in the error when the
// click wasn't on that project's own row.
export async function runOriginAction(root: string, mark: OriginMark, name?: string): Promise<boolean> {
  const store = useOriginStatus.getState();
  if (mark.kind === "conflict" || store.entries[root]?.running) return true;
  store.setRunning(root, true);
  let ok = false;
  try {
    await catchUp(root, mark);
    ok = true;
  } catch (err) {
    const verb = mark.kind === "diverged" ? "Sync" : mark.kind === "base" ? "Update" : "Pull";
    toast.error(`${verb} failed${name ? ` in ${name}` : ""}: ${String(err)}`);
  }
  await recheckOrigin(root);
  const after = useOriginStatus.getState();
  after.setRunning(root, false);
  if (!ok) return false;
  const text = originDoneText(mark);
  after.setDone(root, text);
  setTimeout(() => {
    if (useOriginStatus.getState().entries[root]?.done === text) {
      useOriginStatus.getState().setDone(root, undefined);
    }
  }, DONE_MS);
  return true;
}

export function plainPullMark(root: string): OriginMark | null {
  const entry = useOriginStatus.getState().entries[root];
  if (!entry || entry.running) return null;
  const mark = originMark(entry.status);
  return isPlainPull(mark) ? mark : null;
}

// Pull every row of a deck that only needs a plain pull. One at a time: a deck's
// worktrees share one repository, and two pulls in it race for the same refs.
export async function pullDeck(deck: string, rows: { root: string; name: string }[]): Promise<void> {
  if (useDeckPull.getState().decks[deck]?.running) return;
  const todo = rows.filter((row) => plainPullMark(row.root));
  if (todo.length === 0) return;
  const failed: string[] = [];
  let done = 0;
  const publish = (running: boolean) =>
    useDeckPull.getState().setDeck(deck, { total: todo.length, done, running, failed: [...failed] });
  publish(true);
  for (const row of todo) {
    // Re-read each turn: the poller or the row's own button may have got there first.
    const mark = plainPullMark(row.root);
    if (mark && !(await runOriginAction(row.root, mark, row.name))) failed.push(row.root);
    done++;
    publish(true);
  }
  publish(false);
  if (failed.length > 0) return;
  const finished = useDeckPull.getState().decks[deck];
  setTimeout(() => {
    if (useDeckPull.getState().decks[deck] === finished) useDeckPull.getState().setDeck(deck, undefined);
  }, DONE_MS);
}
