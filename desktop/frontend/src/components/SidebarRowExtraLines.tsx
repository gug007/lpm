import type { RowData } from "../sidebarRowDetails";
import type { RowLine, SidebarRowLayout } from "../sidebarRowLayout";
import type { RowBuiltInNodes } from "./SidebarRowDetail";
import { SidebarRowSide } from "./SidebarRowSide";

interface SidebarRowExtraLinesProps {
  lines: RowLine[];
  data: RowData;
  layout: SidebarRowLayout;
  builtIns: RowBuiltInNodes;
}

/** The lines under a project's name, in the 10px voice of a status note. */
export function SidebarRowExtraLines({ lines, data, layout, builtIns }: SidebarRowExtraLinesProps) {
  return (
    <>
      {lines.map((line, i) => (
        <span
          key={i}
          className="mt-px flex min-w-0 items-center text-[10px] leading-[13px] text-[var(--text-muted)]"
        >
          <SidebarRowSide details={line.left} place="lowerLeft" data={data} layout={layout} builtIns={builtIns} />
          <SidebarRowSide details={line.right} place="lowerRight" data={data} layout={layout} builtIns={builtIns} />
        </span>
      ))}
    </>
  );
}
