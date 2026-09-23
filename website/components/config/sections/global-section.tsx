import {
  GLOBAL_CONFIG_EXAMPLE,
  GLOBAL_UTILITIES_EXAMPLE,
} from "@/app/config/examples";
import { Callout } from "../callout";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";
import { Strong } from "../strong";

export function GlobalSection() {
  return (
    <Section
      id="global-config"
      title="Global config"
      description={
        <>
          Some things aren&rsquo;t tied to any one codebase — system
          maintenance, utilities, your favorite agent. Put those in{" "}
          <code className="font-mono text-gray-600 dark:text-gray-300 text-xs">
            ~/.lpm/global.yml
          </code>{" "}
          and they show up in <Strong>every project</Strong>{" "}automatically. If
          a project defines an action with the same key, the{" "}
          <Strong>project-level entry wins</Strong>. Edit it from Settings
          &rarr; Global Config, or the Global tab of any project&rsquo;s
          config editor.
        </>
      }
    >
      <Lede title="What a fresh install starts with." className="mb-3">
        On a fresh install, lpm writes a <code className="font-mono">global.yml</code>{" "}
        with two terminal actions, <code className="font-mono">claude</code>{" "}
        and <code className="font-mono">codex</code>, so Claude Code and Codex
        are one click away in every project. Edit or remove them like any
        other entry. A minimal file of your own might add a Docker cleanup
        and a system monitor — notice there&rsquo;s no{" "}
        <code className="font-mono">name</code>{" "}or{" "}
        <code className="font-mono">root</code>:
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/global.yml"
        initial={GLOBAL_CONFIG_EXAMPLE}
      />

      <Lede title="System-wide utilities.">
        A fuller example: prune merged git branches, upgrade Homebrew, and keep
        a few system monitors one click away. These all live above individual
        projects — click them from any project and they just work.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/global.yml"
        initial={GLOBAL_UTILITIES_EXAMPLE}
      />

      <Callout title="Only actions">
        <p>
          Global config supports <code className="font-mono">actions</code> —
          including <code className="font-mono">type: terminal</code>{" "}shells —
          and nothing else. No <code className="font-mono">services</code>, no{" "}
          <code className="font-mono">profiles</code>. Long-running processes
          and profile groupings always belong to a specific project, so they
          live in a project file or its <code className="font-mono">.lpm.yml</code>.
        </p>
      </Callout>
    </Section>
  );
}
