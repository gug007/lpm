import { useState, type ReactNode } from "react";
import { ChevronLeftIcon } from "./icons";

export interface DrillApi {
  push: (screen: DrillScreen) => void;
  pop: () => void;
  close: () => void;
}

export interface DrillScreen {
  title?: string;
  render: (api: DrillApi) => ReactNode;
}

export function DrillMenu({
  root,
  onClose,
}: {
  root: DrillScreen;
  onClose: () => void;
}) {
  const [stack, setStack] = useState<DrillScreen[]>([]);
  const api: DrillApi = {
    push: (screen) => setStack((s) => [...s, screen]),
    pop: () => setStack((s) => s.slice(0, -1)),
    close: onClose,
  };
  const screen = stack.length ? stack[stack.length - 1] : root;
  const drilled = stack.length > 0;
  return (
    <div className="w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl">
      {drilled && (
        <div className="mb-1 flex items-center gap-2 border-b border-[var(--border)] px-2 pb-1.5">
          <button
            onClick={api.pop}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <ChevronLeftIcon />
          </button>
          <span className="text-[12.5px] font-medium text-[var(--text-primary)]">
            {screen.title}
          </span>
        </div>
      )}
      {screen.render(api)}
    </div>
  );
}
