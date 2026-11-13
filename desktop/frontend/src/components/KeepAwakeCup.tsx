import type { KeepAwakeSession } from "../hooks/useKeepAwakeSession";
import { MACHINE } from "../machineWords";
import { CoffeeIcon } from "./icons";
import { KeepAwakeHoverCard } from "./KeepAwakeHoverCard";
import { Tooltip } from "./ui/Tooltip";

// The cup on the More button while this machine is kept awake. It answers the
// way the Keep awake row does in the sidebar: resting on it shows the card with
// +1 h and Turn off, and a click opens the whole menu, so neither waits on More.
export function KeepAwakeCup({
  session,
  menuOpen,
  onToggleMenu,
}: {
  session: KeepAwakeSession;
  menuOpen: boolean;
  onToggleMenu: (trigger: HTMLElement) => void;
}) {
  return (
    <Tooltip
      content={<KeepAwakeHoverCard session={session} />}
      side="top"
      wide
      interactive
      delay={150}
      triggerClassName="relative inline-flex"
    >
      <button
        type="button"
        onClick={(e) => onToggleMenu(e.currentTarget)}
        aria-expanded={menuOpen}
        aria-label={`Keep awake: ${MACHINE.thisMachine} is kept awake`}
        className="-m-0.5 flex rounded p-0.5 text-[var(--accent-amber-text)] transition-colors hover:bg-[var(--bg-active)]"
      >
        <CoffeeIcon awake />
      </button>
    </Tooltip>
  );
}
