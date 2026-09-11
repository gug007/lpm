import { AGENT_COUNT, SERVICE_COUNT, WINDOWS } from "./before-after-data";
import { AGENT_ROW_COUNT, PROJECT_COUNT } from "./before-after-replica";

// What each picture shows, for readers who get neither. Both layouts carry
// their own copy; only one is ever displayed, so nothing is read twice.
export function BeforeDescription() {
  return (
    <p className="sr-only">
      {WINDOWS.length} separate terminal windows overlap and hide each other.{" "}
      {SERVICE_COUNT} are services, on ports 3000, 3001, 8080, 6379 and 8888.{" "}
      {AGENT_COUNT} are AI agent sessions: a Claude Code run that stopped to ask
      permission before a database migration, with the answer buried under the
      window in front of it; a Codex run still working; and a second Claude
      Code run that finished and asked a question nobody saw.
    </p>
  );
}

export function AfterDescription() {
  return (
    <p className="sr-only">
      One lpm window holds the same work. A sidebar lists {PROJECT_COUNT}{" "}
      projects, with a green dot on the ones that are running and, under each,
      the agent it is running — amber for the one that needs you, a shimmer for
      the one still working, blue for the one that has finished. A row of tabs
      holds the selected project&apos;s services and the waiting Claude Code
      session, which is in front with its permission prompt in plain sight.
      That is {AGENT_ROW_COUNT} agents in one window.
    </p>
  );
}
