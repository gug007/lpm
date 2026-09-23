import {
  SERVICES_DEPENDS_EXAMPLE,
  SERVICES_EXAMPLE,
} from "@/app/config/examples";
import { Callout } from "../callout";
import { DocLink } from "../doc-link";
import { FieldTable } from "../field-table";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";
import { serviceFields } from "../service-fields-data";
import { Strong } from "../strong";

export function ServicesSection() {
  return (
    <Section
      id="services"
      title="Services"
      description={
        <>
          Services are the <Strong>long-running processes</Strong>{" "}that make up
          your project — your dev server, an API, a background worker, anything
          you&rsquo;d normally leave running in a terminal tab. lpm starts them
          together when you click Start and stops them when you click Stop.
          Most projects have at least one; a project with none still works as
          a home for terminals and agents — it just has no Start button.
        </>
      }
    >
      <Lede className="mb-3">
        If a command runs continuously, it&rsquo;s a service. If it finishes
        and exits — tests, a build, a migration — it belongs in{" "}
        <DocLink href="#actions">Actions</DocLink>{" "}instead. Each service can be
        written as a one-line shorthand (just the command) or as the full form
        when you need <code className="font-mono">cwd</code>,{" "}
        <code className="font-mono">port</code>, or{" "}
        <code className="font-mono">env</code>.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/myapp.yml"
        initial={SERVICES_EXAMPLE}
      />
      <FieldTable fields={serviceFields} />

      <Lede title="Services that depend on each other.">
        When one service builds on another — a web app that talks to an API,
        an API that reads from the database — list the ones it needs in{" "}
        <code className="font-mono">dependsOn</code>. Start{" "}
        <code className="font-mono">web</code>{" "}here and lpm pulls in{" "}
        <code className="font-mono">api</code>{" "}and{" "}
        <code className="font-mono">db</code>{" "}for you and launches them in
        order: <code className="font-mono">db</code>, then{" "}
        <code className="font-mono">api</code>, then{" "}
        <code className="font-mono">web</code>. It starts them in that order
        but doesn&rsquo;t wait for each one to be ready before moving to the
        next, so a service that connects on boot should retry until its
        dependency answers.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/myapp.yml"
        initial={SERVICES_DEPENDS_EXAMPLE}
      />

      <Callout title="Starting and stopping">
        <p>
          Click <Strong>Start</Strong>{" "}in the project toolbar and lpm brings
          your services up together; click <Strong>Stop</Strong>{" "}and they all
          come down. To run just one, switch it on in the Start button&rsquo;s
          dropdown — lpm pulls in whatever it depends on. Selecting a project
          in the sidebar never starts it; a double-click can, if you turn on
          Double-click to start/stop in Settings.
        </p>
        <p>
          If you usually want a subset — say, the web app without the worker —
          define a <DocLink href="#profiles">profile</DocLink>{" "}and pick it from
          the same dropdown.
        </p>
      </Callout>
    </Section>
  );
}
