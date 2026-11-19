import { create } from "zustand";

// A prompt for a project's new-tab box, waiting for that box to open: an
// `lpm://new` link puts it here, and the project's launchpad takes it.
export interface LaunchpadSeed {
  projectName: string;
  // The agent the prompt is for; the box's first agent when it names none.
  agent: string;
  text: string;
  nonce: number;
}

interface LaunchpadSeedState {
  seed: LaunchpadSeed | null;
}

let nonce = 0;

export const useLaunchpadSeed = create<LaunchpadSeedState>(() => ({ seed: null }));

export function seedLaunchpad(projectName: string, agent: string, text: string): void {
  useLaunchpadSeed.setState({ seed: { projectName, agent, text, nonce: ++nonce } });
}

export function takeLaunchpadSeed(projectName: string): LaunchpadSeed | null {
  const { seed } = useLaunchpadSeed.getState();
  if (!seed || seed.projectName !== projectName) return null;
  useLaunchpadSeed.setState({ seed: null });
  return seed;
}
