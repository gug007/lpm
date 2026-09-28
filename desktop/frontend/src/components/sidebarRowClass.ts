const ROW_SHARED_CLASS =
  "flex w-full select-none gap-3 rounded-md px-3 text-left text-sm outline-none transition-colors";
export const ROW_BASE_CLASS = `${ROW_SHARED_CLASS} items-center py-2`;
// `py-1` around a 20px name and a 13px line: 42px, the rhythm SidebarHeaderShell
// gives a folder with something to report.
export const ROW_TWO_LINE_CLASS = `${ROW_SHARED_CLASS} items-start py-1`;
// One disclosure step: `px-3` (12px) plus 15px, applied to the rows inside an
// expanded folder. Overrides ROW_BASE_CLASS's `px-3` the same way `pr-*` does.
// The folder tree's elbows land on the status dot this leaves room for.
export const ROW_INDENT_CLASS = "pl-[27px]";

// Room at a project row's end for what parks there: the ⋮ once the row is
// hovered or holding the menu, the agent chevron, and the mark of a synced copy.
// `action` is where the origin button lines up, just inside that room. Spelled
// out per case — Tailwind only emits the classes it can read here.
const ROW_TRAILING = {
  none: { rest: "group-hover:pr-9", menu: "pr-9", action: "right-9" },
  chevron: { rest: "pr-8 group-hover:pr-14", menu: "pr-14", action: "right-14" },
  mark: { rest: "pr-7 group-hover:pr-14", menu: "pr-14", action: "right-14" },
  both: { rest: "pr-14 group-hover:pr-20", menu: "pr-20", action: "right-20" },
} as const;

export function rowTrailing(chevron: boolean, mark: boolean) {
  return ROW_TRAILING[chevron ? (mark ? "both" : "chevron") : mark ? "mark" : "none"];
}
