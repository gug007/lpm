import type { PaneActionId } from "../../paneActions";
import type { UtilityTabKind } from "./utilityTabToggle";
import { PaneToolbarButton } from "./PaneToolbarButton";
import { PANE_ACTION_META } from "./paneActionMeta";

interface PaneToolbarProps {
  actions: PaneActionId[];
  // The utility tab the pane is showing, if any: its button lights up.
  activeTab: UtilityTabKind | null;
  isDefault: boolean;
  onRun: (id: PaneActionId) => void;
  onMove: (id: PaneActionId) => void;
  onReset: () => void;
}

export function PaneToolbar({ actions, activeTab, isDefault, onRun, onMove, onReset }: PaneToolbarProps) {
  return (
    <>
      {actions.map((id) => (
        <PaneToolbarButton
          key={id}
          id={id}
          active={activeTab !== null && PANE_ACTION_META[id].tab === activeTab}
          isDefault={isDefault}
          onRun={() => onRun(id)}
          onMove={() => onMove(id)}
          onReset={onReset}
        />
      ))}
    </>
  );
}
