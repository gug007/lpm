import { useKeepAwakeSession } from "../hooks/useKeepAwakeSession";
import { KeepAwakePanel } from "./KeepAwakePanel";

// A connected computer's Keep awake, in the footer's menu under its tab.
export function KeepAwakePeerPanel({ slug, name }: { slug: string; name: string }) {
  const session = useKeepAwakeSession(slug);
  return <KeepAwakePanel session={session} title={`Keep ${name} awake`} machine={name} slug={slug} />;
}
