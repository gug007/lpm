import { actionCommands } from "./commands/actions";
import { copyCommands } from "./commands/copies";
import { fileCommands } from "./commands/files";
import { fileSearchCommands } from "./commands/fileSearch";
import { gitCommands } from "./commands/git";
import { jobCommands } from "./commands/jobs";
import { projectCommands } from "./commands/projects";
import { reminderCommands } from "./commands/reminders";
import { serviceCommands } from "./commands/services";
import { settingsCommands } from "./commands/settings";
import { statusCommands } from "./commands/status";
import { terminalCommands } from "./commands/terminals";
import { toolCommands } from "./commands/tools";
import { usageCommands } from "./commands/usage";
import { DEFAULTS } from "./defaults";

export type CommandMap = Record<string, (args: Record<string, unknown>) => unknown>;

export const HANDLERS: CommandMap = {
  ...settingsCommands,
  ...projectCommands,
  ...serviceCommands,
  ...terminalCommands,
  ...statusCommands,
  ...gitCommands,
  ...fileCommands,
  ...fileSearchCommands,
  ...copyCommands,
  ...actionCommands,
  ...usageCommands,
  ...reminderCommands,
  ...jobCommands,
  ...toolCommands,
};

const warned = new Set<string>();
const trace =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("trace");

export function resolveCommand(cmd: string, args: Record<string, unknown>): unknown {
  if (trace) console.debug("[demo]", cmd, args);
  const handler = HANDLERS[cmd];
  if (handler) return handler(args);
  if (cmd in DEFAULTS) return structuredClone(DEFAULTS[cmd]);
  if (!warned.has(cmd)) {
    warned.add(cmd);
    console.warn(`[demo] no handler or default for "${cmd}"`);
  }
  return null;
}
