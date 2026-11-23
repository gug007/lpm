import { ClearStatus } from "../bridge/commands";
import type { StatusKind } from "./components/PaneView";

const asking = new Set<string>();

// Retires a status the user has seen. Every touch asks for as long as its badge
// shows, so only one call is open at a time: on a paired computer that stopped
// answering, each scroll tick would hold one more. A call that fails leaves the
// badge, and the next touch asks again.
export async function clearSeenStatus(projectName: string, terminalId: string, kind: StatusKind): Promise<void> {
  const id = `${projectName}\n${terminalId}\n${kind}`;
  if (asking.has(id)) return;
  asking.add(id);
  try {
    await ClearStatus(projectName, terminalId, kind);
  } catch {
  } finally {
    asking.delete(id);
  }
}
