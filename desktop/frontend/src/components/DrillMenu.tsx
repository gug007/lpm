import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ChevronLeftIcon } from "./icons";
import { DrillCrumb } from "./DrillCrumb";

export interface DrillApi {
  push: (screen: DrillScreen) => void;
  pop: () => void;
  close: () => void;
}

export interface DrillScreen {
  title?: string;
  path?: string;
  // Overrides the DrillMenu panel width while this screen is shown.
  width?: string;
  render: (api: DrillApi) => ReactNode;
  // When true on a drilled screen, DrillMenu auto-pops up a level (e.g. the
  // menu's last item was dragged out and the submenu no longer exists).
  isEmpty?: () => boolean;
}

export function DrillMenu({
  root,
  onClose,
  widthClassName = "w-72",
}: {
  root: DrillScreen;
  onClose: () => void;
  widthClassName?: string;
}) {
  const [stack, setStack] = useState<DrillScreen[]>([]);
  const api: DrillApi = {
    push: (screen) => setStack((s) => [...s, screen]),
    pop: () => setStack((s) => s.slice(0, -1)),
    close: onClose,
  };
  const screen = stack.length ? stack[stack.length - 1] : root;
  const drilled = stack.length > 0;

  useEffect(() => {
    if (stack.length > 0 && screen.isEmpty?.()) setStack((s) => s.slice(0, -1));
  }, [root, stack, screen]);

  const levels = [root, ...stack];
  const lastIndex = levels.length - 1;
  const crumbs = levels.flatMap((level, index) =>
    level.title
      ? [{ title: level.title, path: level.path, index, current: index === lastIndex }]
      : [],
  );

  return (
    <div className={`${screen.width ?? widthClassName} overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl`}>
      {drilled &&
        (crumbs.length <= 1 ? (
          <button
            onClick={api.pop}
            className="mb-1 flex w-full items-center gap-1 border-b border-[var(--border)] px-2 pb-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-secondary)]">
              <ChevronLeftIcon />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--text-primary)]">
              {screen.title}
            </span>
          </button>
        ) : (
          <div className="mb-1 flex items-center gap-1 border-b border-[var(--border)] px-2 pb-1.5">
            <button
              onClick={api.pop}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeftIcon />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
            {crumbs.map((crumb, i) => (
              <Fragment key={crumb.index}>
                {i > 0 && (
                  <span className="shrink-0 select-none px-0.5 text-[12.5px] text-[var(--text-muted)]">
                    /
                  </span>
                )}
                {crumb.current ? (
                  <span className="min-w-0 truncate px-1.5 text-[12.5px] font-medium text-[var(--text-primary)]">
                    {crumb.title}
                  </span>
                ) : crumb.path ? (
                  <DrillCrumb
                    title={crumb.title}
                    path={crumb.path}
                    onNavigate={() => setStack((s) => s.slice(0, crumb.index))}
                  />
                ) : (
                  <button
                    onClick={() => setStack((s) => s.slice(0, crumb.index))}
                    className="min-w-0 max-w-[140px] shrink truncate rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    {crumb.title}
                  </button>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      ))}
      {screen.render(api)}
    </div>
  );
}
