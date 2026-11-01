import { branchColor, type GraphRow } from "../../gitGraph";
import { DIM_OPACITY, LANE_W, NODE_R, ROW_H, isDimmed, laneX, linePath } from "./graphGeometry";

interface HistoryGraphCellProps {
  row: GraphRow;
  lanes: number;
  hover: number | null;
  unpushed: boolean;
}

const MID = ROW_H / 2;

/** One commit's slice of the branch graph: the lines through its row and its
 *  dot, filled while no remote has it and a diamond for a merge. */
export function HistoryGraphCell({ row, lanes, hover, unpushed }: HistoryGraphCellProps) {
  const opacity = (branch: number) => (isDimmed(branch, hover) ? DIM_OPACITY : 1);
  const x = laneX(row.col);
  const color = branchColor(row.branch);
  return (
    <svg width={lanes * LANE_W} height={ROW_H} className="block shrink-0 overflow-hidden" fill="none" strokeWidth={1.5}>
      {row.top.map((line, i) => (
        <path key={`t${i}`} d={linePath(line, 0, MID)} stroke={branchColor(line.branch)} opacity={opacity(line.branch)} />
      ))}
      {row.bottom.map((line, i) => (
        <path key={`b${i}`} d={linePath(line, MID, ROW_H)} stroke={branchColor(line.branch)} opacity={opacity(line.branch)} />
      ))}
      <g opacity={opacity(row.branch)}>
        {row.merge ? (
          <rect
            x={x - NODE_R}
            y={MID - NODE_R}
            width={NODE_R * 2}
            height={NODE_R * 2}
            rx={1}
            transform={`rotate(45 ${x} ${MID})`}
            fill="var(--bg-primary)"
            stroke={color}
          />
        ) : (
          <circle cx={x} cy={MID} r={NODE_R} fill={unpushed ? color : "var(--bg-primary)"} stroke={color} />
        )}
      </g>
    </svg>
  );
}
