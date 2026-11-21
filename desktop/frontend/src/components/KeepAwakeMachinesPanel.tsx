import { useRef, useState } from "react";
import type { KeepAwakeSession } from "../hooks/useKeepAwakeSession";
import type { KeepAwakeMachine } from "../keepAwakeMachines";
import { MACHINE } from "../machineWords";
import { KeepAwakeMachineTabs } from "./KeepAwakeMachineTabs";
import { KeepAwakePanel } from "./KeepAwakePanel";
import { KeepAwakePeerPanel } from "./KeepAwakePeerPanel";

// The footer's Keep awake menu: this machine's panel, or with connected
// computers that can be kept awake, a tab for each above it. Switching tabs
// keeps the tallest height so far: the menu grows up from the footer, so a
// shorter panel would otherwise move the tabs out from under the pointer.
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
  const [minHeight, setMinHeight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const current = machines.find((m) => m.slug === picked) ?? machines[0];

  const pick = (slug: string | null) => {
    const height = ref.current?.offsetHeight ?? 0;
    setMinHeight((prev) => Math.max(prev, height));
    setPicked(slug);
  };

  return (
    <div ref={ref} style={minHeight > 0 ? { minHeight } : undefined}>
      {machines.length > 1 && (
        <KeepAwakeMachineTabs machines={machines} picked={current?.slug ?? null} onPick={pick} />
      )}
      {current?.slug ? (
        <KeepAwakePeerPanel key={current.slug} slug={current.slug} name={current.name} seed={current.reading} />
      ) : (
        <KeepAwakePanel session={local} title={`Keep ${MACHINE.thisMachine} awake`} machine={MACHINE.thisMachine} />
      )}
    </div>
  );
}
