import { ROW_DETAIL_INFO } from "../sidebarRowDetails";
import type { RowDetail } from "../sidebarRowLayout";
import { ROW_DETAIL_LOOK } from "./rowDetailLook";

interface RowDetailFaceProps {
  detail: RowDetail;
  // What the previewed project shows for it: empty for nothing, left out for a
  // detail with no text of its own.
  value?: string;
}

/** A detail's icon, name and value, as the Row builder's chips show it. */
export function RowDetailFace({ detail, value }: RowDetailFaceProps) {
  const { Icon, color } = ROW_DETAIL_LOOK[detail];
  return (
    <>
      <Icon size={12} style={{ color }} className="shrink-0" aria-hidden="true" />
      <span className="whitespace-nowrap font-medium">{ROW_DETAIL_INFO[detail].label}</span>
      {value !== undefined && (
        <span
          className={`max-w-[120px] truncate border-l border-[var(--border)] pl-1.5 text-[11px] tabular-nums text-[var(--text-muted)] ${
            value ? "" : "italic opacity-75"
          }`}
        >
          {value || "none here"}
        </span>
      )}
    </>
  );
}
