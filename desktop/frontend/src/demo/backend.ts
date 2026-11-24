import { actionCommands } from "./commands/actions";
import { archiveCommands } from "./commands/archive";
import { cloneCommands } from "./commands/clone";
import { copyCommands } from "./commands/copies";
import { diskSpaceCommands } from "./commands/diskSpace";
import { fileCommands } from "./commands/files";
import { fileSearchCommands } from "./commands/fileSearch";
import { gitCommands } from "./commands/git";
import { globalConfigCommands } from "./commands/globalConfig";
import { historyCommands } from "./commands/history";
import { portCommands } from "./commands/ports";
import { jobCommands } from "./commands/jobs";
import { generateCommands } from "./commands/generate";
import { keepAwakeCommands } from "./commands/keepAwake";
import { lpmCommandCommands } from "./commands/lpmCommands";
import { notesCommands } from "./commands/notes";
import { projectCommands } from "./commands/projects";
import { issueCommands } from "./commands/issues";
import { pullRequestCommands } from "./commands/pullRequest";
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
  ...archiveCommands,
  ...cloneCommands,
  ...serviceCommands,
  ...terminalCommands,
  ...statusCommands,
  ...gitCommands,
  ...issueCommands,
  ...pullRequestCommands,
  ...historyCommands,
  ...portCommands,
  ...fileCommands,
  ...fileSearchCommands,
  ...copyCommands,
  ...diskSpaceCommands,
  ...actionCommands,
  ...usageCommands,
  ...reminderCommands,
  ...jobCommands,
  ...toolCommands,
  ...keepAwakeCommands,
  ...generateCommands,
  ...lpmCommandCommands,
  ...notesCommands,
  ...globalConfigCommands,
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
