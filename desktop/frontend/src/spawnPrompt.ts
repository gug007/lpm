import { detectAICLI } from "./slashCommands";

// What a queued task types after its command. Someone else's text, such as an
// issue's, goes to an agent and nowhere else: typed into a shell, it would run.
export function spawnPrompt(
  task: { prompt?: string | string[]; agentOnly?: boolean },
  cmd: string | undefined,
): string | string[] | undefined {
  return task.agentOnly && !detectAICLI(cmd) ? undefined : task.prompt;
}
