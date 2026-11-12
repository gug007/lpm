import { serviceExitText } from "../../serviceExit";
import { severityBlocks } from "./logSeverity";

const MAX_ERRORS = 3;
const TAIL_LINES = 40;
const ASK = "Find the cause in the code and fix it.";

/** The latest distinct errors in `plainLog`, oldest first, each with how many
 *  times it was logged. */
function latestErrors(plainLog: string): { text: string; times: number }[] {
  const seen = new Map<string, number>();
  for (const block of severityBlocks(plainLog, "error")) {
    const text = block.join("\n");
    const times = (seen.get(text) ?? 0) + 1;
    seen.delete(text);
    seen.set(text, times);
  }
  return [...seen.entries()].slice(-MAX_ERRORS).map(([text, times]) => ({ text, times }));
}

function quotedErrors(errors: { text: string; times: number }[]): { intro: string; quoted: string } {
  if (errors.length === 1) {
    const [error] = errors;
    return { intro: `this error${error.times > 1 ? ` ${error.times} times` : ""}:`, quoted: error.text };
  }
  return {
    intro: "these errors, the latest last:",
    quoted: errors.map((error) => `${error.text}${error.times > 1 ? `\n(logged ${error.times} times)` : ""}`).join("\n\n"),
  };
}

function lastLines(plainLog: string): string {
  const lines = plainLog.split("\n");
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
  return lines.slice(-TAIL_LINES).join("\n");
}

function subject(service: string, cmd: string | undefined): string {
  return `The \`${service}\` service in this project${cmd ? `, started with \`${cmd}\`,` : ""}`;
}

/** What an agent asked about a service's errors is told: the service, how it
 *  starts, and its latest errors with their stacks. */
export function serviceErrorPrompt(service: string, cmd: string | undefined, plainLog: string): string {
  const { intro, quoted } = quotedErrors(latestErrors(plainLog));
  return [`${subject(service, cmd)} logged ${intro}`, "", "```", quoted, "```", "", ASK].join("\n");
}

/** What an agent asked to fix a crashed service is told, word for word what
 *  lpm Link's ServiceCrashPrompt says: how it ended, then its latest errors,
 *  or its last lines when none of them reads as an error. */
export function serviceCrashPrompt(
  service: string,
  cmd: string | undefined,
  exitCode: number | null,
  plainLog: string,
): string {
  let head = `${subject(service, cmd)} ${serviceExitText({ exitCode })}.`;
  let quoted = "";
  const errors = latestErrors(plainLog);
  if (errors.length > 0) {
    const logged = quotedErrors(errors);
    head += ` It logged ${logged.intro}`;
    quoted = logged.quoted;
  } else {
    quoted = lastLines(plainLog);
    if (quoted) head += " The last lines it printed:";
  }
  return [head, ...(quoted ? ["", "```", quoted, "```"] : []), "", ASK].join("\n");
}
