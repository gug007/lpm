import { useCallback } from "react";
import { toast } from "../notifications/toast";
import { findCommand, parseCommandRun, type ExpandedCommand, type LpmCommandLists } from "../lpmCommands";
import { expandLpmCommand } from "../store/lpmCommands";
import type { AICLI } from "../types";

// Running an lpm skill from the composer: whether a message is `/name args` for
// one of the project's skills, and what to send, worked out by the machine that
// holds the project. With `cli` that is the agent's own call for the skill when
// it can run it, so it arrives as a skill; without, always the prompt itself.
export function useLpmCommandRun(project: string | null, lists: LpmCommandLists | null) {
  const match = useCallback(
    (value: string): { name: string; args: string } | null => {
      if (!lists) return null;
      const run = parseCommandRun(value);
      const command = run ? findCommand(lists, run.name) : null;
      return run && command ? { name: command.name, args: run.args } : null;
    },
    [lists],
  );

  const expand = useCallback(
    async (name: string, args: string, cli?: AICLI): Promise<ExpandedCommand | null> => {
      if (project === null) return null;
      try {
        return await expandLpmCommand(project, name, args, cli);
      } catch (err) {
        toast.error(String(err));
        return null;
      }
    },
    [project],
  );

  return { match, expand };
}

// The note shown when a run still needs a value the arguments didn't give.
export function missingNote(missing: string[]): string {
  const names = missing.map((m) => `{{${m}}}`).join(", ");
  return `Fill in ${names}, then send.`;
}
