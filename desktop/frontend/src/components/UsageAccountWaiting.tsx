import { providerMeta } from "./stats/limitsFormat";
import { UsageEmptyPanel } from "./UsageEmptyPanel";

interface UsageAccountWaitingProps {
  name: string;
  signedIn: boolean;
  projects: string[];
}

function projectList(projects: string[]): string {
  const [first, second] = projects;
  if (projects.length === 1) return first;
  if (projects.length === 2) return `${first} or ${second}`;
  const rest = projects.length - 2;
  return `${first}, ${second}, or ${rest} other project${rest === 1 ? "" : "s"}`;
}

function waitingText({ signedIn, projects }: UsageAccountWaitingProps): string {
  if (!signedIn) {
    return "This account isn't signed in yet. Sign in under Settings → AI & Integrations, and its usage appears here once Claude replies in a project that uses it.";
  }
  if (projects.length === 0) {
    return "No project uses this account yet. Choose it as the Claude account in a project's settings, and its usage appears here once Claude replies there.";
  }
  return `Waiting for a Claude reply on this account. Its usage appears here as soon as Claude answers in ${projectList(projects)}.`;
}

export function UsageAccountWaiting(props: UsageAccountWaitingProps) {
  return (
    <UsageEmptyPanel dot={providerMeta("claude").dot} dim name={props.name}>
      <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
        {waitingText(props)}
      </p>
    </UsageEmptyPanel>
  );
}
