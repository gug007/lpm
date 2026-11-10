import { askWaitingIn, holdsJob, waitingAsks, type JobAsk } from "./jobAsk";
import { stripAnsi } from "./components/terminal/filterLines";

// A running agent's live output, as the backend renders it: what the agent says,
// and one `→ Tool` line for each tool it calls.
export type LivePart = { kind: "text"; text: string } | { kind: "steps"; names: string[] };

const STEP = /^→ (\S.*)$/;

// Terminal escape codes and carriage returns out, for display as text.
export function cleanLive(text: string | undefined): string {
  return stripAnsi(text ?? "").replace(/\r/g, "");
}

export function liveParts(text: string): LivePart[] {
  const parts: LivePart[] = [];
  for (const line of text.split("\n")) {
    const step = STEP.exec(line.trim());
    const last = parts[parts.length - 1];
    if (step) {
      if (last?.kind === "steps") last.names.push(step[1]);
      else parts.push({ kind: "steps", names: [step[1]] });
    } else if (last?.kind === "text") {
      last.text += `\n${line}`;
    } else if (line.trim()) {
      parts.push({ kind: "text", text: line });
    }
  }
  return parts.map((p) => (p.kind === "text" ? { kind: "text", text: p.text.trimEnd() } : p));
}

// "Skill, Read, Bash ×7": each tool once, in the order first used, with how
// many times it ran when more than once.
export function stepsLabel(names: string[]): string {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(", ");
}

// The live output with every run of steps folded onto one line, so a burst of
// tool calls can't push what the agent said out of a short tail.
export function foldSteps(text: string): string {
  return liveParts(text)
    .map((p) => (p.kind === "text" ? p.text : `→ ${stepsLabel(p.names)}`))
    .join("\n");
}

// The questions the run still going asked in `project`: a question that came
// from a finished run names its entry (`at`), and a keyed one belongs to no run.
export function runningRunAsks(
  job: { running?: boolean; asks?: JobAsk[]; ask?: JobAsk },
  project: string,
): JobAsk[] {
  if (!job.running) return [];
  return waitingAsks(job).filter((ask) => ask.at === undefined && holdsJob(ask) && askWaitingIn(ask, project));
}
