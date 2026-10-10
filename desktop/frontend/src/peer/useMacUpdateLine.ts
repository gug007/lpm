import { useMacUpdates, cancelMacUpdate, startMacUpdate } from "../store/macUpdates";
import { useUpdateTarget } from "../store/releaseVersions";
import { macUpdateLine, type MacUpdateLine, type MacUpdatePeer } from "./macUpdate";

/** What a paired Mac's header or row says about updating it, and its action:
 *  start the update, or cancel the one under way. */
export function useMacUpdateLine(
  slug: string,
  name: string,
  peer: MacUpdatePeer,
): { line: MacUpdateLine | null; act: () => void } {
  const target = useUpdateTarget();
  const update = useMacUpdates((s) => s[slug]);
  const line = macUpdateLine(update, peer, target);
  const act = () => {
    if (line?.action?.kind === "update") void startMacUpdate(slug, name, peer.version ?? "", target);
    else if (line?.action?.kind === "cancel") void cancelMacUpdate(slug);
  };
  return { line, act };
}
