import { FOCUS } from "../ports/portsStyles";

export const ARCHIVE_GRID =
  "grid grid-cols-[1rem_minmax(10rem,1.7fr)_minmax(5.5rem,0.6fr)_minmax(11rem,1.5fr)_minmax(5rem,0.6fr)_10.5rem] items-center gap-3";

export const ARCHIVE_PRIMARY = `flex h-7 items-center whitespace-nowrap rounded-md bg-[var(--text-primary)] px-2.5 text-[12px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 ${FOCUS}`;
