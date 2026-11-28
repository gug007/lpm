import type { CommandMap } from "../backend";
import type { TalkAgentOption, TalkPlace, TalkProjectOption, TalkReply } from "../../talk/plan";

// The sample Mac sorts a sentence by the words in it, with no AI behind it:
// a project it names, "copy" or "worktree", and an agent it names.
function demoPlan(text: string, projects: TalkProjectOption[], agents: TalkAgentOption[]): TalkReply {
  const said = text.trim();
  const lower = said.toLowerCase();
  if (!said) return { ok: false, error: "Say or type what to do first.", unsupported: false };
  if (lower.includes("delete")) {
    return {
      ok: false,
      error: "A plan can only duplicate a project, start an agent and send it a prompt.",
      unsupported: true,
    };
  }
  const named = projects.find((p) => lower.includes(p.name.toLowerCase()) || lower.includes(p.label.toLowerCase()));
  const where: TalkPlace = lower.includes("worktree")
    ? "worktree"
    : lower.includes("duplicate") || lower.includes("copy")
      ? "copy"
      : "here";
  const agent = agents.find((a) => lower.includes(a.id))?.id ?? agents[0]?.id ?? "claude";
  return {
    ok: true,
    plan: { project: named?.name ?? "", where, agent, prompt: said, label: where === "here" ? "" : "talk" },
    candidates: named
      ? []
      : projects
          .filter((p) => !p.parent)
          .slice(0, 2)
          .map((p) => p.name),
  };
}

export const talkCommands: CommandMap = {
  talk_plan: ({ text, projects, agents }) =>
    demoPlan(String(text ?? ""), (projects ?? []) as TalkProjectOption[], (agents ?? []) as TalkAgentOption[]),
};
