import { branchColor, type GraphLine } from "../../gitGraph";
import { DIM_OPACITY, GAP_H, LANE_W, isDimmed, linePath } from "./graphGeometry";

interface HistoryGraphGapProps {
  // The lines leaving the row above, carried on through the gap.
  lines: GraphLine[];
  lanes: number;
  hover: number | null;
}

/** The branch lines carried through a row that isn't a commit. */
export function HistoryGraphGap({ lines, lanes, hover }: HistoryGraphGapProps) {
  const carried = [...new Map(lines.map((line) => [line.to, line])).values()];
  return (
    <svg width={lanes * LANE_W} height={GAP_H} className="block shrink-0 overflow-hidden" fill="none" strokeWidth={1.5}>
      {carried.map((line) => (
        <path
          key={line.to}
          d={linePath({ ...line, from: line.to }, 0, GAP_H)}
          stroke={branchColor(line.branch)}
          opacity={isDimmed(line.branch, hover) ? DIM_OPACITY : 1}
        />
      ))}
    </svg>
  );
}
