import { useEffect, useState } from "react";
import { readKeepAwake } from "../keepAwake";
import type { KeepAwakeReading } from "../keepAwakeMachines";
import { keepAwakeSource } from "./useKeepAwakeSession";

/** Each connected computer's Keep awake, kept live, by slug. One that hasn't
 *  answered, or runs an lpm too old to say, is missing. */
export function useKeepAwakePeers(slugs: string[]): Record<string, KeepAwakeReading> {
  const key = slugs.join("\n");
  const [readings, setReadings] = useState<Record<string, KeepAwakeReading>>({});

  useEffect(() => {
    const list = key ? key.split("\n") : [];
    let live = true;
    setReadings((prev) => Object.fromEntries(Object.entries(prev).filter(([slug]) => list.includes(slug))));
    const offs = list.map((slug) => {
      const source = keepAwakeSource(slug);
      const take = (raw: unknown) => {
        const state = readKeepAwake(raw);
        if (!live || !state) return;
        const endsAt = state.endsIn === null ? null : Date.now() + state.endsIn;
        setReadings((prev) => ({ ...prev, [slug]: { state, endsAt } }));
      };
      source.state().then(take, () => {});
      return source.subscribe(take);
    });
    return () => {
      live = false;
      offs.forEach((off) => off());
    };
  }, [key]);

  return readings;
}
