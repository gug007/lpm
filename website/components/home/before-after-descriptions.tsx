import { AGENT_COUNT, SERVICE_COUNT, WINDOWS } from "./before-after-data";
import { PROJECT_COUNT } from "./before-after-replica";

// What the two pictures show, for readers who get neither. Rendered once for
// both layouts; the desktop slider points at it with aria-describedby.
export function CompareDescription({ id }: { id: string }) {
  return (
    <p id={id} className="sr-only">
      Before, on the left: {WINDOWS.length} separate terminal windows on a desk.{" "}
      {SERVICE_COUNT} are services, on ports 3000, 3001, 8080, 6379 and 8888.{" "}
      {AGENT_COUNT} are AI agent sessions: a Claude Code run in auth-service that
      stopped to ask permission before a database migration, with the api window
      lying on top of its options; a Codex run still working; and a second Claude
      Code run that finished and asked a question nobody saw. After, on the right:
      one lpm window on the same desk. Its sidebar lists {PROJECT_COUNT} running
      projects with the agent under each: amber with a bell for the one that needs
      you, a shimmer for the one still working, blue with a check for the one that
      is done. The auth-service services are tabs, and the waiting session is in
      front with its permission prompt in plain sight, in the spot where the
      buried window was.
    </p>
  );
}
