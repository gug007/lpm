import type { LaunchpadTab } from "../../launchpadAgentActions";
import { TerminalIcon } from "../icons";
import { LaunchpadMark } from "../LaunchpadMark";
import { LaunchpadGroupTab } from "./LaunchpadGroupTab";
import { LaunchpadRadioTab } from "./LaunchpadRadioTab";

// Where the launchpad's prompt goes, picked at the top of its box: a terminal
// that runs what's typed, or an agent.
export function LaunchpadDestinationTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: LaunchpadTab[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Start in"
      // A click on a tab, or in a tab's menu, leaves the keyboard in the prompt.
      onMouseDown={(e) => e.preventDefault()}
      className="flex flex-wrap items-center gap-1 px-2 pt-2"
    >
      <LaunchpadRadioTab checked={value === "terminal"} onClick={() => onChange("terminal")}>
        <TerminalIcon />
        Terminal
      </LaunchpadRadioTab>
      {tabs.length > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-[var(--border)]" />}
      {tabs.map((tab) => {
        if (tab.options.length > 1) return <LaunchpadGroupTab key={tab.key} tab={tab} value={value} onChange={onChange} />;
        const [option] = tab.options;
        return (
          <LaunchpadRadioTab key={tab.key} checked={value === option.id} onClick={() => onChange(option.id)}>
            <LaunchpadMark agent={option.agent} emoji={option.emoji} size={14} />
            {option.label}
          </LaunchpadRadioTab>
        );
      })}
    </div>
  );
}
