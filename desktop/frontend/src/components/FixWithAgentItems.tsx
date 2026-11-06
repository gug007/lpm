import { useMemo } from "react";
import { launchpadTabs, type LaunchpadOption } from "../launchpadAgentActions";
import { useAppStore } from "../store/app";
import type { AICLI } from "../types";
import { LaunchpadMark } from "./LaunchpadMark";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";

const DESCRIPTION = "Opens a new tab with the failing checks";

/** A checks menu's "Fix with …" rows: every agent the project's empty
 *  launchpad offers, less the actions that start on a task of their own. A
 *  header split button or menu is one row whose submenu holds its items; a
 *  split's row itself runs the item its button leads with. */
export function FixWithAgentItems({
  projectName,
  onFix,
}: {
  projectName: string;
  onFix: (option: LaunchpadOption) => void;
}) {
  const actions = useAppStore((s) => s.projects.find((p) => p.name === projectName)?.actions);
  const tabs = useMemo(() => launchpadTabs(actions ?? [], projectName, { skipOwnTasks: true }), [actions, projectName]);
  const only = tabs.length === 1 && tabs[0].options.length === 1;
  const mark = (agent: AICLI, emoji: string | undefined) => <LaunchpadMark agent={agent} emoji={emoji} size={12} />;

  return (
    <>
      {tabs.map((tab) => {
        if (tab.options.length === 1) {
          const [option] = tab.options;
          return (
            <ContextMenuItem
              key={tab.key}
              icon={mark(option.agent, option.emoji)}
              label={`Fix with ${option.label}`}
              description={only ? DESCRIPTION : undefined}
              title={only ? undefined : DESCRIPTION}
              onClick={() => onFix(option)}
            />
          );
        }
        const lead = tab.primary;
        return (
          <ContextMenuSubmenu
            key={tab.key}
            icon={mark((lead ?? tab.options[0]).agent, (lead ?? tab).emoji)}
            label={`Fix with ${lead?.label ?? tab.label}`}
            onActivate={lead ? () => onFix(lead) : undefined}
          >
            {tab.options.map((option) => (
              <ContextMenuItem
                key={option.id}
                icon={mark(option.agent, option.emoji)}
                label={option.label}
                onClick={() => onFix(option)}
              />
            ))}
          </ContextMenuSubmenu>
        );
      })}
    </>
  );
}
