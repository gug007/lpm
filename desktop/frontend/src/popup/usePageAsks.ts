import { useCallback, useContext, useRef } from "react";
import { isPageRefresh, PageRunContext, pageRunAskOf, type PageRunResult } from "./pageRun";

export type PageReply = PageRunResult & { id: string };

// Acts on what a page posts (`lpm.run`, `lpm.refresh`) and hands `reply` what
// came of a run. A page runs one action at a time, so a loop in its script
// can't open a terminal per turn.
export function usePageAsks(onRefresh: (() => void) | undefined) {
  const run = useContext(PageRunContext);
  const latest = useRef({ run, onRefresh });
  latest.current = { run, onRefresh };
  const busy = useRef(false);

  return useCallback((message: unknown, reply: (answer: PageReply) => void) => {
    if (isPageRefresh(message)) {
      latest.current.onRefresh?.();
      return;
    }
    const ask = pageRunAskOf(message);
    if (!ask) return;
    const answer = (result: PageRunResult) => reply({ ...result, id: ask.id });
    const runner = latest.current.run;
    if (!runner) return answer({ ok: false, error: "This page can't run actions here." });
    if (busy.current) return answer({ ok: false, error: "This page's last run hasn't finished." });
    busy.current = true;
    runner(ask.action, ask.inputs)
      .catch((err: unknown): PageRunResult => ({ ok: false, error: String(err) }))
      .then((result) => {
        busy.current = false;
        answer(result);
      });
  }, []);
}
