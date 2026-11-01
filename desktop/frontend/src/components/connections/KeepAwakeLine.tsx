import { useState } from "react";
import { useKeepAwakeLeft, useKeepAwakeSession } from "../../hooks/useKeepAwakeSession";
import { keepAwakeLine } from "../../keepAwake";
import { CoffeeIcon } from "../icons";
import { KeepAwakeMenu } from "../KeepAwakeMenu";
import { DetailLine } from "./DetailLine";

// A connected computer's Keep awake, set from here: keep a desk machine awake
// for an agent left working on it. Absent while it can't be kept awake, or
// runs an lpm too old to say.
export function KeepAwakeLine({ slug, name }: { slug: string; name: string }) {
  const session = useKeepAwakeSession(slug);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const left = useKeepAwakeLeft(session.endsAt);
  const { state } = session;
  if (!state?.supported) return null;
  const on = state.mode !== "off";

  return (
    <DetailLine title="Keep it awake" subtitle={keepAwakeLine(state, left)}>
      <button
        type="button"
        aria-expanded={anchor !== null}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-[12px] font-medium transition-colors hover:bg-[var(--bg-hover)] ${
          on ? "text-[var(--accent-amber-text)]" : "text-[var(--text-secondary)]"
        }`}
      >
        <CoffeeIcon awake={state.active} />
        {on ? "Change" : "Keep awake"}
      </button>
      {anchor && (
        <KeepAwakeMenu
          session={session}
          title={`Keep ${name} awake`}
          machine={name}
          place={{ anchor }}
          align="end"
          onClose={() => setAnchor(null)}
        />
      )}
    </DetailLine>
  );
}
