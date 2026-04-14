import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ListOpenInTargets, OpenIn } from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";

export type OpenInTarget = main.OpenInTarget;

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
  try {
    await OpenIn(t.id, projectPath);
  } catch (err) {
    toast.error(`Open in ${t.label}: ${err}`);
  }
}
