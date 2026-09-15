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
