export interface SecretFinding {
  path: string;
  // 1-based line in the new file; 0 when the finding is about the whole file.
  line: number;
  // What it looks like: "Stripe secret key", "Environment file".
  rule: string;
  // The value with only its kind and last characters showing: sk_live_••••Qx.
  masked: string;
}

export const findingKey = (f: SecretFinding) => `${f.path}\u0000${f.line}\u0000${f.rule}`;

/** What is still in the way of the commit: findings in files it includes on
 *  lines nobody chose to ignore. */
export function openFindings(
  findings: SecretFinding[],
  selected: ReadonlySet<string>,
  ignored: ReadonlySet<string>,
): SecretFinding[] {
  return findings.filter((f) => selected.has(f.path) && !ignored.has(findingKey(f)));
}

/** "src/lib/stripe.ts:12", or just the path for a whole-file finding. */
export function findingPlace(f: SecretFinding): string {
  return f.line > 0 ? `${f.path}:${f.line}` : f.path;
}
