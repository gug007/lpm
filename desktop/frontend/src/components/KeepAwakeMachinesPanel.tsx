import { useState } from "react";
import type { KeepAwakeSession } from "../hooks/useKeepAwakeSession";
import type { KeepAwakeMachine } from "../keepAwakeMachines";
import { MACHINE } from "../machineWords";
import { KeepAwakeMachineTabs } from "./KeepAwakeMachineTabs";
import { KeepAwakePanel } from "./KeepAwakePanel";
import { KeepAwakePeerPanel } from "./KeepAwakePeerPanel";

// The footer's Keep awake menu: this machine's panel, or with connected
// computers that can be kept awake, a tab for each above it.
export function KeepAwakeMachinesPanel({
  machines,
  local,
  initial,
}: {
  machines: KeepAwakeMachine[];
  local: KeepAwakeSession;
  initial: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(initial);
  const current = machines.find((m) => m.slug === picked) ?? machines[0];

  return (
    <div>
      {machines.length > 1 && (
        <KeepAwakeMachineTabs machines={machines} picked={current?.slug ?? null} onPick={setPicked} />
      )}
      {current?.slug ? (
        <KeepAwakePeerPanel key={current.slug} slug={current.slug} name={current.name} />
      ) : (
        <KeepAwakePanel session={local} title={`Keep ${MACHINE.thisMachine} awake`} machine={MACHINE.thisMachine} />
      )}
    </div>
  );
}
