import { useMemo, useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import { FOLDER_AGENTS, folderChoices, loadAgentFolders, saveAgentFolders } from "../../agentFolders";
import { useAppStore } from "../../store/app";
import { LaunchpadFooterMenu } from "./LaunchpadFooterMenu";

const PANEL_WIDTH = 320;

// Beside the launchpad's model: the other projects this project's agents may
// also read and change, for work that spans two of them. Kept per project,
// for every agent started here from now on.
export function LaunchpadFoldersMenu({ projectName }: { projectName: string }) {
  const projects = useAppStore((s) => s.projects);
  const choices = useMemo(() => folderChoices(projects, projectName), [projects, projectName]);
  const [picked, setPicked] = useState<string[]>(() => loadAgentFolders()[projectName] ?? []);
  const live = picked.filter((name) => choices.some((p) => p.name === name));
  if (choices.length === 0) return null;

  const toggle = (name: string) => {
    const next = live.includes(name) ? live.filter((n) => n !== name) : [...live, name];
    setPicked(next);
    saveAgentFolders(projectName, next);
  };

  return (
    <LaunchpadFooterMenu
      width={PANEL_WIDTH}
      label="Folders the agent can work in"
      title="Other projects the agent can work in"
      triggerClassName={`shrink-0 ${live.length ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
      panelClassName="flex max-h-[360px] flex-col overflow-hidden"
      trigger={
        <>
          <FolderPlus size={13} strokeWidth={1.75} />
          {live.length ? `+${live.length} folder${live.length === 1 ? "" : "s"}` : "Folders"}
        </>
      }
    >
      <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Also work in
      </p>
      <div className="min-h-0 overflow-y-auto pb-1">
        {choices.map((p) => {
          const on = live.includes(p.name);
          return (
            <button
              key={p.name}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => toggle(p.name)}
              className="mx-1 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span
                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] ${
                  on ? "bg-[var(--accent-blue)] text-white" : "border-[1.5px] border-[var(--text-muted)]"
                }`}
              >
                {on && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-primary)]">
                {p.label || p.name}
                <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">{p.root}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[11px] leading-snug text-[var(--text-muted)]">
        {FOLDER_AGENTS} started here from now on can read and change these too. Each folder's changes show in its own project.
      </p>
    </LaunchpadFooterMenu>
  );
}
