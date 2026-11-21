import type { KeepAwakeState } from "./keepAwake";

// The computers the footer's Keep awake menu offers: this one, then each
// connected one that can be kept awake. A server that never sleeps says it
// can't be, so it gets no tab.

export interface KeepAwakeReading {
  state: KeepAwakeState;
  /** When its set time or after-agents countdown ends, on this clock. */
  endsAt: number | null;
}

export interface KeepAwakeMachine {
  /** Null for this machine. */
  slug: string | null;
  name: string;
  /** Null while this machine's state is loading. */
  reading: KeepAwakeReading | null;
}

export interface KeepAwakePeer {
  slug: string;
  name: string;
}

export function keepAwakeMachines(
  local: KeepAwakeReading | null,
  thisMachine: string,
  peers: KeepAwakePeer[],
  readings: Record<string, KeepAwakeReading>,
): KeepAwakeMachine[] {
  const machines: KeepAwakeMachine[] = [];
  if (local?.state.supported !== false) machines.push({ slug: null, name: thisMachine, reading: local });
  for (const peer of peers) {
    const reading = readings[peer.slug];
    if (reading?.state.supported) machines.push({ slug: peer.slug, name: peer.name, reading });
  }
  return machines;
}

export function isOn(machine: KeepAwakeMachine): boolean {
  return (machine.reading?.state.mode ?? "off") !== "off";
}

/** Where the menu opens: this machine while it's on, else the first connected
 *  one that is, else this one. */
export function firstPick(machines: KeepAwakeMachine[]): string | null {
  const local = machines.find((m) => m.slug === null);
  if (local && isOn(local)) return null;
  return machines.find(isOn)?.slug ?? local?.slug ?? machines[0]?.slug ?? null;
}
