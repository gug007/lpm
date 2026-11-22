import { Check, ChevronDown, SquareTerminal } from "lucide-react";
import { useShellList } from "../../hooks/useShellList";
import { shellName } from "../../shells";
import { LaunchpadFooterMenu } from "./LaunchpadFooterMenu";

const PANEL_WIDTH = 280;

// Beside the launchpad's Open Terminal: the shell this one terminal opens in.
// It starts on the project's default and is forgotten once the terminal opens;
// Settings › Terminal › Shell changes the default.
export function LaunchpadShellMenu({
  projectName,
  picked,
  onPick,
}: {
  projectName: string;
  picked: string | null;
  onPick: (id: string) => void;
}) {
  const { shells, defaultId } = useShellList(projectName);
  if (shells.length < 2) return null;
  const currentId = picked ?? defaultId;
  const current = shells.find((s) => s.id === currentId) ?? shells.find((s) => s.login) ?? shells[0];

  return (
    <LaunchpadFooterMenu
      width={PANEL_WIDTH}
      label="Shell"
      triggerLabel={`Shell: ${current.label}`}
      title="The shell this terminal opens in"
      triggerClassName="min-w-0 shrink"
      panelClassName="flex max-h-[360px] flex-col overflow-hidden"
      trigger={
        <>
          <SquareTerminal size={13} strokeWidth={1.75} className="shrink-0 text-[var(--text-muted)]" />
          <span className="min-w-0 truncate text-[var(--text-primary)]">{current.label}</span>
          <ChevronDown size={12} strokeWidth={2} className="shrink-0 text-[var(--text-muted)]" />
        </>
      }
    >
      {(close) => (
        <>
          <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Open in
          </p>
          <div role="menu" className="min-h-0 overflow-y-auto pb-1">
            {shells.map((shell) => {
              const on = shell.id === current.id;
              return (
                <button
                  key={shell.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  title={shell.detail}
                  onClick={() => {
                    onPick(shell.id);
                    close();
                  }}
                  className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <span className="flex w-3.5 shrink-0 justify-center text-[var(--accent-green)]">
                    {on && <Check size={12} strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{shellName(shell, shells)}</span>
                  {shell.id === defaultId && (
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">default</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </LaunchpadFooterMenu>
  );
}
