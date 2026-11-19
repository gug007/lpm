import type { Launchpad, LaunchpadProject } from "../../hooks/useLaunchpad";
import { InputComposer } from "../InputComposer";
import { LaunchpadDestinationTabs } from "./LaunchpadDestinationTabs";
import { LaunchpadModelMenu } from "./LaunchpadModelMenu";
import { LaunchpadFoldersMenu } from "./LaunchpadFoldersMenu";
import { takesFolders } from "../../agentFolders";

// The launchpad's prompt: where it goes picked at the top of the box, then a
// task for that agent or a command for a terminal, with the composer's tools
// under it. ↵ starts it in a new tab; left empty, the pick just opens.
export function LaunchpadPrompt({
  project,
  launchpad,
  focusRequest,
  fontSize,
  onSelect,
  onStart,
}: {
  project: LaunchpadProject;
  launchpad: Launchpad;
  // Bumped when ⌘T asked for the launcher, so the prompt takes the keyboard.
  focusRequest: number;
  fontSize?: number;
  onSelect: (id: string) => void;
  onStart: () => void;
}) {
  const { tabs, option, command, pick } = launchpad;
  const startLabel = option && command === null ? `Start ${option.label}` : command ? "Run" : "Open Terminal";

  return (
    <InputComposer
      key={launchpad.seeded?.key}
      defaultValue={launchpad.seeded?.value}
      tone="terminal"
      fontSize={fontSize}
      onChange={launchpad.setValue}
      onSubmit={onStart}
      focusRequest={focusRequest}
      placeholder={option ? `Task for ${option.label} (optional)` : "Command to run (optional)"}
      header={<LaunchpadDestinationTabs tabs={tabs} value={option?.id ?? "terminal"} onChange={onSelect} />}
      history={{ terminalId: project.name, projectName: project.name, terminalLabel: project.label }}
      aiCwd={project.root}
      memory={option ? { project: project.name, agent: option.agent } : undefined}
      footer={
        <>
          <span className="min-w-0 flex-1" />
          {option && command === null && takesFolders(option.agent) && <LaunchpadFoldersMenu projectName={project.name} />}
          {pick && command === null && <LaunchpadModelMenu pick={pick} onChange={launchpad.changePick} />}
          <button
            type="button"
            onClick={onStart}
            disabled={launchpad.value.pending}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 text-[12px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {startLabel}
            <kbd className="font-sans text-[11px] opacity-70">↵</kbd>
          </button>
        </>
      }
    />
  );
}
