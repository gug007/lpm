import { severityBlocks } from "./logSeverity";

const MAX_ERRORS = 3;

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

/** What an agent asked about a service's errors is told: the service, how it
 *  starts, and its latest errors with their stacks. */
export function serviceErrorPrompt(service: string, cmd: string | undefined, plainLog: string): string {
  const errors = latestErrors(plainLog);
  const started = cmd ? `, started with \`${cmd}\`,` : "";
  const intro =
    errors.length === 1
      ? `logged this error${errors[0].times > 1 ? ` ${errors[0].times} times` : ""}:`
      : "logged these errors, the latest last:";
  const quoted =
    errors.length === 1
      ? errors[0].text
      : errors.map((error) => `${error.text}${error.times > 1 ? `\n(logged ${error.times} times)` : ""}`).join("\n\n");
  return [
    `The \`${service}\` service in this project${started} ${intro}`,
    "",
    "```",
    quoted,
    "```",
    "",
    "Find the cause in the code and fix it.",
  ].join("\n");
}
