import { useEffect } from "react";
import { EventsOn } from "../../bridge/runtime";
import { toast } from "../notifications/toast";
import { useCiFixLoops } from "../store/ciFixLoop";
import { CI_FIX_LOOP_EVENT, type CiFixLoop } from "../types";

/** Keeps Keep fixing until green current, here and on connected computers,
 *  and says once how each loop ended. */
export function useCiFixLoopEvents(): void {
  useEffect(() => {
    const off = EventsOn(CI_FIX_LOOP_EVENT, (loop: CiFixLoop) => {
      if (!loop?.project) return;
      useCiFixLoops.getState().apply(loop);
      if (loop.state === "passed") toast.success(loop.detail, { description: `${loop.branch} · ${loop.agent}`, event: "ci" });
      if (loop.state === "stopped") toast.error("Stopped fixing CI", { description: loop.detail, event: "ci" });
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, []);
}
