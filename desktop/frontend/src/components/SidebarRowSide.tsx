import { Fragment, type ReactNode } from "react";
import type { RowData } from "../sidebarRowDetails";
import type { RowDetail, SidebarRowLayout } from "../sidebarRowLayout";
import { ROLLUP_SEPARATOR_CLASS } from "./sidebarRollup";
import { SidebarRowDetail, type RowBuiltInNodes } from "./SidebarRowDetail";

// Line 1's left side follows the name. It stays whole, as an agent's word
// always has, unless it holds text that can be cut (a branch, a note), and
// then it gives way before the name does. A lower line's left side is one run
// of text cut with an ellipsis. Right sides never shrink, so numbers and pull
// requests stay whole.
const PLACE_CLASS = {
  firstLeft: "flex min-w-0 shrink-0 items-center gap-2 text-[11px]",
  firstRight: "ml-auto flex shrink-0 items-center gap-1.5 text-[11px]",
  lowerLeft: "min-w-0 truncate",
  lowerRight: "ml-auto flex shrink-0 items-center gap-1.5 pl-1.5",
} as const;

const FIRST_LEFT_SHRINKS = "flex min-w-0 shrink-[3] items-center gap-2 overflow-hidden text-[11px]";
const CUTTABLE = new Set<RowDetail>(["branch", "status"]);

export type RowSidePlace = keyof typeof PLACE_CLASS;

interface SidebarRowSideProps {
  details: RowDetail[];
  place: RowSidePlace;
  data: RowData;
  layout: SidebarRowLayout;
  builtIns: RowBuiltInNodes;
  // Drawn first on the side even with no details: line 1's "Merged" mark.
  lead?: ReactNode;
}

/** One side of one line of a project's sidebar row. */
export function SidebarRowSide({ details, place, data, layout, builtIns, lead }: SidebarRowSideProps) {
  if (details.length === 0 && !lead) return null;
  const separated = place === "lowerLeft";
  const shrinks = place === "firstLeft" && details.some((d) => CUTTABLE.has(d));
  return (
    <span className={shrinks ? FIRST_LEFT_SHRINKS : PLACE_CLASS[place]}>
      {lead}
      {details.map((detail, i) => (
        <Fragment key={detail}>
          {separated && i > 0 && <span className={ROLLUP_SEPARATOR_CLASS}>·</span>}
          <SidebarRowDetail
            detail={detail}
            data={data}
            layout={layout}
            builtIns={builtIns}
            chip={place === "firstRight" || place === "lowerRight"}
          />
        </Fragment>
      ))}
    </span>
  );
}
