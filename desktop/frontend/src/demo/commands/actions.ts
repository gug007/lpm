import type { CommandMap } from "../backend";
import type { SeedAction } from "../seed/types";
import { emitEvent } from "../ipc";
import { lineText } from "../ansi";
import { project, record } from "./state";

const DEFAULT_MS = 900;

// A menu child is found by its path, `deploy:production`.
function find(actions: SeedAction[] | undefined, path: string): SeedAction | undefined {
  const [head, ...rest] = path.split(":");
  const hit = actions?.find((a) => a.name === head);
  return rest.length ? find(hit?.children, rest.join(":")) : hit;
}

// Looks the action up and notes the run, which leaves no other trace.
function start(projectName: unknown, actionName: unknown): SeedAction | undefined {
  record("action", String(projectName), String(actionName));
  return find(project(String(projectName))?.actions, String(actionName));
}

// Plays the action's output on its own clock and settles when the last line
// lands — success, as a seeded action always ends.
function play(action: SeedAction | undefined, onLine: (line: string) => void): Promise<void> {
  const lines = action?.output ?? [{ text: "done", at: DEFAULT_MS / 2 }];
  const end = Math.max(action?.durationMs ?? DEFAULT_MS, ...lines.map((l) => l.at));
  for (const line of lines) setTimeout(() => onLine(lineText(line)), line.at);
  return new Promise((resolve) => setTimeout(resolve, end + 50));
}

export const actionCommands: CommandMap = {
  run_action: ({ projectName, actionName, runId }) => {
    const action = start(projectName, actionName);
    if (!action?.output?.[0]?.text.startsWith("$ ")) {
      emitEvent("action-output", { runId, line: `$ ${action?.cmd ?? actionName}` });
    }
    void play(action, (line) => emitEvent("action-output", { runId, line })).then(() =>
      emitEvent("action-done", { runId, success: true }),
    );
    return null;
  },
  run_action_background: ({ projectName, actionName, runId }) =>
    play(start(projectName, actionName), (line) => emitEvent("action-bg-output", { runId, line })).then(
      () => null,
    ),
  run_command: ({ cmd, runId }) => {
    emitEvent("action-output", { runId, line: `$ ${cmd}` });
    void play(undefined, (line) => emitEvent("action-output", { runId, line })).then(() =>
      emitEvent("action-done", { runId, success: true }),
    );
    return null;
  },
  stop_command: () => null,
};
