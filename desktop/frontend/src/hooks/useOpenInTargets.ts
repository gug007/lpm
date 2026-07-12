import { useEffect, useState } from "react";
import { toast } from "../toast";
import { ListOpenInTargets, OpenIn } from "../../bridge/commands";
import { main } from "../../bridge/models";

export type OpenInTarget = main.OpenInTarget;

export const OPEN_IN_SELECTED_KEY = "lpm.openIn.selectedId";

export function primaryOpenInTarget(targets: OpenInTarget[]): OpenInTarget | null {
  if (targets.length === 0) return null;
  const id = localStorage.getItem(OPEN_IN_SELECTED_KEY) ?? "";
  return targets.find((t) => t.id === id) ?? targets[0];
}

let cache: OpenInTarget[] | null = null;

export function useOpenInTargets() {
  const [targets, setTargets] = useState<OpenInTarget[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    ListOpenInTargets().then((list) => {
      cache = list;
      setTargets(list);
    }).catch(() => {});
  }, []);
  return targets;
}

export async function launchOpenInTarget(t: OpenInTarget, projectPath: string) {
  // Launching an app makes it the last-used one, so every entry point (sidebar
  // "Open with", the toolbar dropdown) surfaces it as the default next time —
  // primaryOpenInTarget reads this key.
  localStorage.setItem(OPEN_IN_SELECTED_KEY, t.id);
  try {
    await OpenIn(t.id, projectPath);
  } catch (err) {
    toast.error(`Open in ${t.label}: ${err}`);
  }
}
