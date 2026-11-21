import type { ReactNode } from "react";
import type { PrCheckState } from "../types";
import { checkStateIcon } from "./ChecksButton";

/** One line of the PR card: a check-state icon and what it stands for. */
export function PrMergeLine({
  state,
  className = "",
  children,
}: {
  state: PrCheckState;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 text-[11px] text-[var(--text-secondary)] ${className}`}>
      {checkStateIcon(state)}
      <span className="truncate">{children}</span>
    </div>
  );
}
