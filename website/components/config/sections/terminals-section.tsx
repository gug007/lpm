import {
  TERMINALS_AGENTS_EXAMPLE,
  TERMINALS_EXAMPLE,
} from "@/app/config/examples";
import { Callout } from "../callout";
import { FieldTable } from "../field-table";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";
import { Strong } from "../strong";
import { terminalFields } from "../terminal-fields-data";

export function TerminalsSection() {
  return (
    <Section
      id="terminals"
      title="Terminals"
      description={
        <>
          Terminals are <Strong>persistent interactive shells</Strong>{" "}you open
          from the desktop app with a single click — a live log tail, a Node or
          Python REPL, or an AI coding agent like Claude Code. Unlike a
          service, a terminal isn&rsquo;t something lpm starts and stops with
          the project; unlike an action, it doesn&rsquo;t run once and exit. It
          stays open and you type in it until you close it.
          <br />
          <br /> A terminal is just an{" "}
          <Strong>
            action with <code className="font-mono">type: terminal</code>
          </Strong>{" "}
          — same fields as any action, it simply opens in a pane and stays open
          instead of running once. A standalone{" "}
          <code className="font-mono">terminals:</code>{" "}section still works as
          a deprecated alias, but new configs should use{" "}
          <code className="font-mono">type: terminal</code>.
        </>
      }
    >
      <Lede title="Declaring a terminal." className="mb-3">
        Give the entry a <code className="font-mono">cmd</code>{" "}and set{" "}
        <code className="font-mono">type: terminal</code>{" "}so it opens in a pane
        and stays open instead of running once. Reach for a friendlier{" "}
        <code className="font-mono">label</code>, tuck it into the footer with{" "}
        <code className="font-mono">display: footer</code>, or set a{" "}
        <code className="font-mono">cwd</code>{" "}or{" "}
        <code className="font-mono">env</code>{" "}when you need them:
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/myapp.yml"
        initial={TERMINALS_EXAMPLE}
      />
      <FieldTable fields={terminalFields} />

      <Callout title="Header or footer?">
        <p>
          Header is the default — every terminal lands in the toolbar unless
          you say otherwise. Move the tightest, always-one-click controls to
          the footer with <code className="font-mono">display: footer</code>{" "}
          so they sit beside the branch switcher without crowding the main
          button row.
        </p>
      </Callout>

      <Lede title="AI coding agents, one click away." className="mt-6 mb-3">
        This is where terminals really shine. List the agents and REPLs you
        actually use and they&rsquo;re waiting as one-click buttons in the
        project toolbar every time you open the project — each one starts in
        the project&rsquo;s folder, so there&rsquo;s no hunting for the right
        window or directory:
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/myapp.yml"
        initial={TERMINALS_AGENTS_EXAMPLE}
      />
    </Section>
  );
}
