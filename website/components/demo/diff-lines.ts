import type { DiffLine } from "./projects";

export type DiffRow = { line: DiffLine; oldNo: number | null; newNo: number | null };

// Monaco shows the original and modified line numbers side by side; the hunk
// header is what re-seeds both counters.
export function numberDiff(lines: readonly DiffLine[]): DiffRow[] {
  let oldNo = 1;
  let newNo = 1;
  return lines.map((line) => {
    if (line.t === "hunk") {
      const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line.text);
      if (at) {
        oldNo = Number(at[1]);
        newNo = Number(at[2]);
      }
      return { line, oldNo: null, newNo: null };
    }
    if (line.t === "add") return { line, oldNo: null, newNo: newNo++ };
    if (line.t === "del") return { line, oldNo: oldNo++, newNo: null };
    return { line, oldNo: oldNo++, newNo: newNo++ };
  });
}
