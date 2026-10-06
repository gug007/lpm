import { isWindows } from "./platform";
import { shellQuote } from "./terminal-io";

// `cli 'prompt'` for a terminal to run. On Windows the terminal is Git Bash,
// which rewrites an argument that looks like a POSIX path (`/init`,
// `/review the diff`) into a path under the Git install when it starts the
// native CLI, so a slash command is excluded from that rewrite. Only that word:
// the agent inherits the setting, and its own commands still need the rewrite.
export function agentPromptCommand(cli: string, prompt: string, win = isWindows): string {
  const command = `${cli} ${shellQuote(prompt)}`;
  const word = /^\/\S*/.exec(prompt)?.[0];
  if (!win || !word || word.length < 2 || word.slice(1).includes("/")) return command;
  return `MSYS2_ARG_CONV_EXCL=${shellQuote(word)} ${command}`;
}
