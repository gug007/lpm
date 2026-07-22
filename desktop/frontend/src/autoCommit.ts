import { toast } from "sonner";
import { GitCommit, GitPush } from "../bridge/commands";
import { getSettings } from "./store/settings";
import { DEFAULT_PUSH_CONFIG, pushFlags } from "./gitOptions";

export async function runAutoCommit(opts: {
  projectName: string;
  projectPath: string;
  paths: string[];
  andPush: boolean;
  generate: () => Promise<string>;
}): Promise<void> {
  const { projectName, projectPath, paths, andPush, generate } = opts;
  const op = (async () => {
    const msg = (await generate())?.trim();
    if (!msg) throw new Error("empty commit message");
    await GitCommit(projectPath, msg, paths);
    if (andPush) {
      const cfg = getSettings().gitPush ?? DEFAULT_PUSH_CONFIG;
      await GitPush(projectPath, pushFlags(cfg));
    }
  })();
  toast.promise(op, {
    loading: `${projectName}: generating commit message…`,
    success: andPush
      ? `${projectName}: committed and pushed`
      : `${projectName}: committed`,
    error: (err) =>
      `${projectName}: auto ${andPush ? "commit & push" : "commit"} failed: ${err}`,
  });
  await op.catch(() => {});
}
