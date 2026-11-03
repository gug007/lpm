import { DetailLine } from "./DetailLine";
import { Toggle } from "./Toggle";
import { useSaving } from "./useSaving";

// Whether a computer's agents may run commands on another (`lpm exec --on`).
// The computer they would run on keeps the setting and holds every command to it.
export function AgentRunLine({
  title,
  subtitle,
  on,
  save,
}: {
  title: string;
  subtitle: string;
  on: boolean;
  save: (on: boolean) => Promise<unknown>;
}) {
  const { busy, run } = useSaving("Couldn't change whether agents may run commands");
  return (
    <DetailLine title={title} subtitle={subtitle}>
      <Toggle enabled={on} ariaLabel={title} disabled={busy} onChange={(next) => void run(() => save(next))} />
    </DetailLine>
  );
}
