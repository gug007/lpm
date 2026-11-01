import type { GraphLine } from "../../gitGraph";

export const LANE_W = 14;
export const ROW_H = 30;
export const GAP_H = 24;
// Lanes past this many are cut off rather than squeezing the subjects.
export const MAX_LANES = 12;
export const NODE_R = 3.5;
export const DIM_OPACITY = 0.25;

export const laneX = (lane: number) => LANE_W / 2 + lane * LANE_W;

/** Whether `branch` fades while the line of `hover` is hovered. */
export const isDimmed = (branch: number, hover: number | null) => hover !== null && branch !== hover;

/** A line from lane `from` at y0 to lane `to` at y1, leaving and arriving
 *  upright so it meets the rows above and below without a kink. */
export function linePath({ from, to }: GraphLine, y0: number, y1: number): string {
  const x0 = laneX(from);
  const x1 = laneX(to);
  if (x0 === x1) return `M ${x0} ${y0} L ${x1} ${y1}`;
  const mid = (y0 + y1) / 2;
  return `M ${x0} ${y0} C ${x0} ${mid} ${x1} ${mid} ${x1} ${y1}`;
}
