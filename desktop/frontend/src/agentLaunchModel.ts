import { switchableCLI, type ModelPick, type SwitchableCLI } from "./agentModelSwitch";
import { findAICLI } from "./slashCommands";

const VALUE = String.raw`(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)`;

// Each CLI's own spelling of the model and level flags: how to find one
// already on the command (it is replaced, not left to fight the new one) and
// how to write it.
const FLAGS: Record<SwitchableCLI, Record<keyof ModelPick, { existing: RegExp; write: (v: string) => string }>> = {
  claude: {
    model: { existing: new RegExp(String.raw`\s--model${VALUE}`, "g"), write: (v) => `--model ${v}` },
    effort: { existing: new RegExp(String.raw`\s--effort${VALUE}`, "g"), write: (v) => `--effort ${v}` },
  },
  codex: {
    model: { existing: new RegExp(String.raw`\s(?:-m|--model)${VALUE}`, "g"), write: (v) => `-m ${v}` },
    effort: {
      existing: /\s(?:-c|--config)\s+(?:"model_reasoning_effort=[^"]*"|'model_reasoning_effort=[^']*'|model_reasoning_effort=\S*)/g,
      write: (v) => `-c model_reasoning_effort=${v}`,
    },
  },
};

// `cmd` with the Claude Code or Codex it launches pinned to `pick`, as
// session-only flags right after the CLI's name, so nothing in the user's agent
// config changes. An empty half leaves that flag as it was; any other command,
// or no pick, comes back unchanged.
export function pinLaunchCommand(cmd: string, pick: ModelPick | undefined): string {
  const found = findAICLI(cmd);
  const cli = switchableCLI(found?.cli);
  if (!found || !cli || !pick) return cmd;
  const added: string[] = [];
  let rest = cmd.slice(found.end);
  for (const half of ["model", "effort"] as const) {
    if (!pick[half]) continue;
    const flag = FLAGS[cli][half];
    rest = rest.replace(flag.existing, "");
    added.push(flag.write(pick[half]));
  }
  return added.length ? `${cmd.slice(0, found.end)} ${added.join(" ")}${rest}` : cmd;
}
