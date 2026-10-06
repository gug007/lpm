import { GetMsysMounts } from "../../../bridge/commands";
import type { MsysMounts } from "../../path";
import { isWindows } from "../../platform";

let pending: Promise<MsysMounts | null> | null = null;

// Where Git Bash's own `/…` paths live, asked once; a failed ask is retried.
export function msysMounts(): Promise<MsysMounts | null> {
  if (!isWindows) return Promise.resolve(null);
  pending ??= GetMsysMounts().catch(() => {
    pending = null;
    return null;
  });
  return pending;
}
