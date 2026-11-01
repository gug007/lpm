import { useEffect } from "react";
import { KeepAwakeSet, PeerInvoke } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import {
  EXTRA_MINUTES,
  KEEP_AWAKE_CHANGED,
  KEEP_AWAKE_HEADS_UP,
  PEER_KEEP_AWAKE_HEADS_UP,
  keepAwakeHeadsUp,
  readKeepAwake,
} from "../keepAwake";
import { MACHINE } from "../machineWords";
import { toast } from "../notifications/toast";

interface HeadsUp {
  slug?: string;
  machine?: string;
  reason?: string;
  endsIn?: number;
}

// An end read again within this much of the one announced is the same end.
const SAME_END_MS = 5_000;

/** Five minutes before Keep awake lets go by itself, here or on a connected
 *  computer, a toast offers an hour more. It goes once that end moves or passes,
 *  whoever moved it. */
export function useKeepAwakeHeadsUp(): void {
  useEffect(() => {
    const watching = new Map<string, () => void>();
    const stopWatching = (id: string) => {
      watching.get(id)?.();
      watching.delete(id);
    };

    const show = ({ slug, machine, reason, endsIn = 0 }: HeadsUp) => {
      const id = `keep-awake-heads-up:${slug ?? ""}`;
      const endsAt = Date.now() + endsIn;
      const onChange = (raw: unknown) => {
        const state = readKeepAwake(raw);
        if (!state) return;
        const end = state.endsIn === null ? null : Date.now() + state.endsIn;
        if (end === null || Math.abs(end - endsAt) > SAME_END_MS) {
          stopWatching(id);
          toast.dismiss(id);
        }
      };
      stopWatching(id);
      watching.set(
        id,
        slug
          ? EventsOn(`peer-evt-${slug}`, (event: { name?: string; payload?: unknown } | null) => {
              if (event?.name === KEEP_AWAKE_CHANGED) onChange(event.payload);
            })
          : EventsOn(KEEP_AWAKE_CHANGED, onChange),
      );
      const extend = () => {
        stopWatching(id);
        const request = slug
          ? PeerInvoke(slug, "keep_awake_set", { mode: "extend", minutes: EXTRA_MINUTES })
          : KeepAwakeSet("extend", EXTRA_MINUTES);
        request.catch((err: unknown) => toast.error(String(err)));
      };
      const { title, description } = keepAwakeHeadsUp(
        slug ? (machine ?? MACHINE.OtherMachine) : MACHINE.ThisMachine,
        reason,
        endsIn,
      );
      toast.warning(title, {
        id,
        description,
        duration: Math.max(endsIn, 1_000),
        event: "keepAwake",
        action: { label: "+1 h", onClick: extend },
        cancel: { label: "Let it sleep", onClick: () => stopWatching(id) },
      });
    };

    const offLocal = EventsOn(KEEP_AWAKE_HEADS_UP, (h: HeadsUp) => show({ ...h, slug: undefined }));
    const offPeers = EventsOn(PEER_KEEP_AWAKE_HEADS_UP, (h: HeadsUp) => {
      if (h.slug) show(h);
    });
    return () => {
      offLocal();
      offPeers();
      [...watching.keys()].forEach(stopWatching);
    };
  }, []);
}
