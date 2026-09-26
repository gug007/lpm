import { toast } from "sonner";
import { GitMerge, GitOriginStatus, GitPush, PullBranch } from "../bridge/commands";
import { DEFAULT_PULL_CONFIG, DEFAULT_PUSH_CONFIG, pullFlags, pushFlags } from "./gitOptions";
import { originDoneText, type OriginMark, type OriginStatus } from "./originStatus";
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
// recount so the row reflects what actually happened.
export async function runOriginAction(root: string, mark: OriginMark): Promise<void> {
  const store = useOriginStatus.getState();
  if (mark.kind === "conflict" || store.entries[root]?.running) return;
  store.setRunning(root, true);
  let ok = false;
  try {
    await catchUp(root, mark);
    ok = true;
  } catch (err) {
    toast.error(`${mark.kind === "diverged" ? "Sync" : mark.kind === "base" ? "Update" : "Pull"} failed: ${String(err)}`);
  }
  await recheckOrigin(root);
  const after = useOriginStatus.getState();
  after.setRunning(root, false);
  if (!ok) return;
  const text = originDoneText(mark);
  after.setDone(root, text);
  setTimeout(() => {
    if (useOriginStatus.getState().entries[root]?.done === text) {
      useOriginStatus.getState().setDone(root, undefined);
    }
  }, DONE_MS);
}
