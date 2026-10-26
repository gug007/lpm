import { DetachIcon } from "./icons";

const LABEL = {
  own: "Opens in its own window",
  main: "Opens in the main window",
} as const;

// A row that opens in another window says so before it's clicked.
export function SidebarWindowMark({ opensIn }: { opensIn: keyof typeof LABEL }) {
  return (
    <span className="shrink-0 text-[var(--text-muted)]" title={LABEL[opensIn]}>
      <DetachIcon />
    </span>
  );
}
