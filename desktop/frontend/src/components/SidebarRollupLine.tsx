import { ROLLUP_SEPARATOR_CLASS, visibleRollup, type RollupSegment } from "./sidebarRollup";

/** The second line of a collapsed container's header: what it is standing in
 *  for, in the sidebar's own words. Shared by folders and paired machines so the
 *  two cannot drift into speaking differently about the same thing. */
export function SidebarRollupLine({ segments }: { segments: RollupSegment[] }) {
  const { shown, overflow } = visibleRollup(segments);
  return (
    <>
      {shown.map((segment, i) => (
        <span key={segment.key}>
          {i > 0 && <span className={ROLLUP_SEPARATOR_CLASS}>·</span>}
          <span className={segment.className}>{segment.text}</span>
        </span>
      ))}
      {overflow > 0 && <span> +{overflow}</span>}
    </>
  );
}
