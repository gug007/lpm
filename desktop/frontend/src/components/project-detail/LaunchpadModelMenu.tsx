import { ChevronDown } from "lucide-react";
import { levelName, modelName, newTabModelLabel, type NewTabPick } from "../../newTabPick";
import { AI_CLI_OPTIONS } from "../../types";
import { LauncherModelChoices } from "../terminal/LauncherModelChoices";
import { LaunchpadFooterMenu } from "./LaunchpadFooterMenu";

const PANEL_WIDTH = 300;

// The model and level the launchpad's agent opens with, beside Start; the
// pills are the + popup's.
export function LaunchpadModelMenu({
  pick,
  onChange,
}: {
  pick: NewTabPick;
  onChange: (pick: NewTabPick) => void;
}) {
  const summary = newTabModelLabel(pick);
  if (!summary) return null;
  const agentLabel = AI_CLI_OPTIONS.find((o) => o.value === pick.agent)?.label ?? pick.agent;

  return (
    <LaunchpadFooterMenu
      width={PANEL_WIDTH}
      label={`${agentLabel} model and level`}
      triggerLabel={`${agentLabel} model and level: ${summary}`}
      triggerClassName="min-w-0 shrink"
      panelClassName="px-3 pb-3 pt-2.5"
      trigger={
        <>
          <span className="min-w-0 truncate text-[var(--text-primary)]">{modelName(pick.agent, pick.model)}</span>
          {pick.effort && (
            <span className="shrink-0 text-[var(--text-muted)]">{levelName(pick.agent, pick.model, pick.effort)}</span>
          )}
          <ChevronDown size={12} strokeWidth={2} className="shrink-0 text-[var(--text-muted)]" />
        </>
      }
    >
      <LauncherModelChoices pick={pick} onChange={onChange} />
    </LaunchpadFooterMenu>
  );
}
