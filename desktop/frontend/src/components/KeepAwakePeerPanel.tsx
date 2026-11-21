import { useKeepAwakeSession } from "../hooks/useKeepAwakeSession";
import type { KeepAwakeReading } from "../keepAwakeMachines";
import { KeepAwakePanel } from "./KeepAwakePanel";

// A connected computer's Keep awake, in the footer's menu under its tab. It
// starts from the reading the footer already has, so switching tabs doesn't
// flash an empty panel while the computer answers.
export function KeepAwakePeerPanel({
  slug,
  name,
  seed,
}: {
  slug: string;
  name: string;
  seed: KeepAwakeReading | null;
}) {
  const session = useKeepAwakeSession(slug, true, seed);
  return <KeepAwakePanel session={session} title={`Keep ${name} awake`} machine={name} slug={slug} />;
}
