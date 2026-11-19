import { Monitor } from "lucide-react";
import { MACHINE } from "../../machineWords";
import { usePeerState } from "../../peer/usePeerState";
import { handoffHome, handoffTargets, type HandoffTarget } from "../../sessionHandoff";
import { useAppStore } from "../../store/app";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuSubmenu } from "../ui/ContextMenuSubmenu";

interface TabContinueOnSubmenuProps {
  projectName: string;
  onPick: (target: HandoffTarget) => void;
  onClose: () => void;
}

/** "Continue on ▸" for a Claude tab with a conversation to carry: the paired
 *  computers its session can move to, or this one for a tab that runs on a
 *  paired computer. Absent when no computer is paired. */
export function TabContinueOnSubmenu({ projectName, onPick, onClose }: TabContinueOnSubmenuProps) {
  const { state, loaded } = usePeerState();
  const projects = useAppStore((s) => s.projects);
  const project = projects.find((p) => p.name === projectName);
  if (!loaded || !project) return null;

  const row = (target: HandoffTarget, label: string, icon?: React.ReactNode) => (
    <ContextMenuItem
      key={target.slug}
      label={label}
      icon={icon}
      description={target.reason}
      disabled={target.reason !== undefined}
      onClick={() => {
        onPick(target);
        onClose();
      }}
    />
  );

  const home = handoffHome(project, projects, state.peers);
  if (home) return row(home, `Continue on ${MACHINE.thisMachine}`, <Monitor size={12} />);

  const targets = handoffTargets(project, projects, state.peers);
  if (targets.length === 0) return null;
  return (
    <ContextMenuSubmenu label="Continue on" icon={<Monitor size={12} />}>
      <div className="min-w-48">{targets.map((target) => row(target, target.label))}</div>
    </ContextMenuSubmenu>
  );
}
