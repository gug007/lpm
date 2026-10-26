import { EXTENDS_EXAMPLE, TEMPLATE_EXAMPLE } from "@/app/config/template-examples";
import { Callout } from "../callout";
import { CodeBlock } from "../code-block";
import { Lede } from "../lede";
import { Section } from "../section";

export function TemplatesSection() {
  return (
    <Section
      id="templates"
      title="Templates"
      description={
        <>
          A template is a set of actions and terminals you reuse across some
          projects but not all — the Rails tools for your Rails apps, say. Save
          it in{" "}
          <code className="font-mono text-xs text-gray-600 dark:text-gray-300">
            ~/.lpm/templates/
          </code>
          {" "}and pull it in by name with{" "}
          <code className="font-mono text-xs text-gray-600 dark:text-gray-300">
            extends
          </code>
          .
        </>
      }
    >
      <Lede title="Writing a template." className="mb-3">
        A template holds only <code className="font-mono">actions</code>, with
        terminals written as <code className="font-mono">type: terminal</code>:
      </Lede>
      <CodeBlock filename="~/.lpm/templates/rails-tools.yml">
        {TEMPLATE_EXAMPLE}
      </CodeBlock>

      <Lede title="Using it." className="mt-6 mb-3">
        List templates in <code className="font-mono">extends</code>{" "}in a
        project file, <code className="font-mono">.lpm.yml</code>, or{" "}
        <code className="font-mono">global.yml</code>. The file that extends
        wins field by field, so you can change one command and keep the rest:
      </Lede>
      <CodeBlock filename="~/.lpm/projects/shop.yml">{EXTENDS_EXAMPLE}</CodeBlock>

      <Callout title="Good to know">
        <p>
          With several templates, the earlier one in the list wins. A
          template&rsquo;s own <code className="font-mono">extends</code>{" "}is
          not followed, and a name with no matching file is skipped.
        </p>
      </Callout>
    </Section>
  );
}
