import { failureText } from "../backgroundRunToastText";
import { stripAnsi } from "../terminal/filterLines";

const TAIL_LINES = 60;

interface FailedRun {
  label: string;
  cmd?: string;
  error?: string;
  lines: string[];
}

/** What an agent asked to fix a failed run is told: what ran, how it ended,
 *  and the end of its output. */
export function actionFailurePrompt({ label, cmd, error, lines }: FailedRun): string {
  const plain = lines.map((line) => stripAnsi(line).trimEnd());
  while (plain.length > 0 && plain[plain.length - 1] === "") plain.pop();
  const ran = cmd && cmd !== label ? `\`${label}\` (\`${cmd}\`)` : `\`${cmd ?? label}\``;
  const ended = error ? ` with ${failureText(error, plain.length > 0)}` : "";
  const ask = "Find the cause and fix it.";
  if (plain.length === 0) return `Running ${ran} in this project failed${ended}, without printing anything. ${ask}`;
  return [`Running ${ran} in this project failed${ended}. Its last output:`, "", "```", ...plain.slice(-TAIL_LINES), "```", "", ask].join(
    "\n",
  );
}
