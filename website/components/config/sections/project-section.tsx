import { PROJECT_EXAMPLE, SSH_EXAMPLE } from "@/app/config/examples";
import { Callout } from "../callout";
import { CodeBlock } from "../code-block";
import { DocLink } from "../doc-link";
import { FieldTable } from "../field-table";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { projectFields } from "../project-fields-data";
import { Section } from "../section";
import { Strong } from "../strong";

export function ProjectSection() {
  return (
    <Section
      id="project"
      title="Project"
      description={
        <>
          A project is one app you work on with lpm — a website, an API, a
          blog, anything you&rsquo;d normally start in a terminal. Each one is a
          file in{" "}
          <code className="font-mono text-xs text-gray-600 dark:text-gray-300">
            ~/.lpm/projects/
          </code>
          , and it
          starts with <Strong>the folder the code lives in</Strong>.
        </>
      }
    >
      <Lede className="mb-3">Edit the YAML — the preview updates live.</Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/myapp.yml"
        initial={PROJECT_EXAMPLE}
      />

      <Callout
        title="You don’t have to write this from scratch"
        className="mb-4"
      >
        <p>
          Click <Strong>+</Strong>{" "}in the sidebar and pick a folder, or clone a
          repository. lpm creates this file for you and fills in the services
          it finds in the project&rsquo;s own files — see{" "}
          <DocLink href="#detection">automatic service detection</DocLink>.
          Edit it later in the app, as a form or as YAML.
        </p>
      </Callout>

      <FieldTable fields={projectFields} />

      <Lede title="SSH projects.">
        Swap <code className="font-mono">root</code>{" "}for an{" "}
        <code className="font-mono">ssh</code>{" "}block and the same services,
        actions, and terminals run on a remote machine. Adding an SSH host in
        the app writes this for you, with one{" "}
        <code className="font-mono">shell</code>{" "}service that opens a login
        shell on the host. lpm doesn&rsquo;t scan remote folders for services,
        so add your own.
      </Lede>
      <CodeBlock filename="~/.lpm/projects/staging.yml">{SSH_EXAMPLE}</CodeBlock>
    </Section>
  );
}
