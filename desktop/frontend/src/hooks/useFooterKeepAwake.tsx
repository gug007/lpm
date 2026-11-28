import { type RefObject, useMemo, useState } from "react";
import { CoffeeIcon } from "../components/icons";
import { KeepAwakeBadge } from "../components/KeepAwakeBadge";
import { KeepAwakeFooterButton } from "../components/KeepAwakeFooterButton";
import { KeepAwakeHoverCard } from "../components/KeepAwakeHoverCard";
import { KeepAwakeMachinesPanel } from "../components/KeepAwakeMachinesPanel";
import { KeepAwakeMenu } from "../components/KeepAwakeMenu";
import type { SidebarNavEntry } from "../components/SidebarNavRow";
import { firstPick, isOn, keepAwakeMachines } from "../keepAwakeMachines";
import { MACHINE } from "../machineWords";
import type { PeerClient } from "../peer/usePeerState";
import { useKeepAwakeSession } from "./useKeepAwakeSession";
import { useKeepAwakePeers } from "./useKeepAwakePeers";

interface AwakeMenu {
  x: number;
  y: number;
  trigger?: HTMLElement;
  pick: string | null;
}

/** The sidebar footer's Keep awake: its row, the cup that stands in for it
 *  while it's folded into More, and the menu either opens, with a tab for each
 *  connected computer that can be kept awake. */
export function useFooterKeepAwake({
  peers,
  footerRef,
  inSidebar,
}: {
  peers: PeerClient[];
  footerRef: RefObject<HTMLDivElement | null>;
  /** The row sits in the sidebar rather than in More. */
  inSidebar: boolean;
}) {
  const local = useKeepAwakeSession(null);
  const connected = useMemo(
    () =>
      peers
        .filter((p) => p.enabled && p.connected)
        .map((p) => ({ slug: p.slug, name: p.alias || p.host || MACHINE.AnotherMachine })),
    [peers],
  );
  const readings = useKeepAwakePeers(connected.map((p) => p.slug));
  const machines = keepAwakeMachines(
    local.state ? { state: local.state, endsAt: local.endsAt } : null,
    MACHINE.ThisMachine,
    connected,
    readings,
  );
  const others = machines.filter((m) => m.slug !== null && isOn(m));
  const localMode = local.state?.mode ?? "off";
  const [menu, setMenu] = useState<AwakeMenu | null>(null);

  const place = (trigger: HTMLElement | undefined, pick: string | null): AwakeMenu | null => {
    const rect = footerRef.current?.getBoundingClientRect();
    return rect ? { x: rect.right + 6, y: rect.bottom, trigger, pick } : null;
  };
  const toggle = (trigger?: HTMLElement) =>
    setMenu((open) => (open ? null : place(trigger, firstPick(machines))));
  const openOn = (pick: string | null) => setMenu(place(undefined, pick));

  const card =
    localMode !== "off" || others.length > 0 ? (
      <KeepAwakeHoverCard session={local} others={others} onOpen={openOn} />
    ) : undefined;

  const entry: SidebarNavEntry = {
    id: "awake",
    label: "Keep awake",
    icon: (
      <span className={localMode !== "off" ? "text-[var(--accent-amber-text)]" : undefined}>
        <CoffeeIcon awake={local.state?.active === true} />
      </span>
    ),
    // Folded into More, the footer's own button opens the menu and shows it
    // open, so More doesn't light up for it.
    active: menu !== null && inSidebar,
    onSelect: toggle,
    description: `Keep ${MACHINE.thisMachine} awake while agents work, for a set time, or until you turn it off.`,
    hoverCard: card,
    popupOpen: menu !== null,
    submenu: <KeepAwakeMachinesPanel machines={machines} local={local} initial={firstPick(machines)} />,
    trailing: <KeepAwakeBadge session={local} />,
  };

  return {
    entry,
    /** A machine here or connected can be kept awake. */
    offered: machines.length > 0,
    cup: (className: string) => (
      <KeepAwakeFooterButton
        session={local}
        card={card}
        menuOpen={menu !== null}
        onToggleMenu={toggle}
        className={className}
      />
    ),
    menu: menu && (
      <KeepAwakeMenu place={{ x: menu.x, y: menu.y }} trigger={menu.trigger} onClose={() => setMenu(null)}>
        <KeepAwakeMachinesPanel key={menu.pick ?? ""} machines={machines} local={local} initial={menu.pick} />
      </KeepAwakeMenu>
    ),
  };
}
