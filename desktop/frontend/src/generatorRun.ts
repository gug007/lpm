import { shellQuote } from "./terminal-io";
import type { GeneratorRunSpec } from "./types";

// Translates a generator's run spec into the command launched in the new
// project's terminal, plus the tab label. "command" runs the raw shell command;
// "ai" launches the selected agent CLI (falling back to the global default)
// with the prompt as a launch argument.
export function buildGeneratorRunCommand(
  spec: GeneratorRunSpec,
  defaultCli: string,
): { label: string; cmd: string } {
  if (spec.type === "command") {
    return { label: "Setup", cmd: spec.command.trim() };
  }
  const cli = spec.cli || defaultCli || "claude";
  const prompt = spec.prompt.trim();
  return { label: "Agent", cmd: prompt ? `${cli} ${shellQuote(prompt)}` : cli };
}
