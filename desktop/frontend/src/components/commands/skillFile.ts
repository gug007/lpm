import type { CommandScope } from "../../lpmCommands";
import { isPeerMarked } from "../../peer/markers";

// Where a skill's file is, from this computer: here; on a paired computer, where
// the viewer reads it but a file manager has nothing to show; or on an SSH host,
// which lpm can only name.
export type SkillFileReach = "here" | "paired" | "ssh";

export function skillFileReach(path: string, scope: CommandScope, onSsh: boolean): SkillFileReach {
  if (onSsh && scope === "project") return "ssh";
  return isPeerMarked(path) ? "paired" : "here";
}

export const canOpenSkillFile = (reach: SkillFileReach) => reach !== "ssh";
export const canRevealSkillFile = (reach: SkillFileReach) => reach === "here";

export interface SkillFiles {
  reachOf: (path: string, scope: CommandScope) => SkillFileReach;
  open: (path: string) => void;
}
