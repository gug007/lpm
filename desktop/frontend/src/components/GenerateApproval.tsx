import { useCallback, useEffect, useState } from "react";
import { EventsOn } from "../../bridge/runtime";
import { GenerateAnswer, GenerateRequests } from "../../bridge/commands";
import { GENERATE_REQUEST_EVENT, type GenerateDecision, type GenerateRequest } from "../generate";
import { toast } from "../notifications/toast";
import { GenerateRequestCard } from "./GenerateRequestCard";

// An agent's `lpm generate` waiting for a yes (generate/approval.rs). Mounted at
// the app root and floating over it, so the terminal behind stays readable;
// the agent waits until someone answers here.
export function GenerateApproval() {
  const [requests, setRequests] = useState<GenerateRequest[]>([]);

  const refresh = useCallback(async () => {
    try {
      setRequests((await GenerateRequests()) ?? []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return EventsOn(GENERATE_REQUEST_EVENT, () => void refresh());
  }, [refresh]);

  const active = requests[0] ?? null;
  if (!active) return null;

  const answer = async (decision: GenerateDecision, prompt?: string, key?: string) => {
    try {
      await GenerateAnswer(active.id, decision, prompt, key);
      setRequests((cur) => cur.filter((r) => r.id !== active.id));
    } catch (err) {
      toast.error(key ? "Couldn't save the key" : "Couldn't answer the request", { description: String(err) });
      void refresh();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-12 z-40 flex justify-center px-4">
      <GenerateRequestCard key={active.id} request={active} waiting={requests.length - 1} onAnswer={answer} />
    </div>
  );
}
