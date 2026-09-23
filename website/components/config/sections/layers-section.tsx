import { REPO_EXAMPLE, REPO_OVERRIDE_EXAMPLE } from "@/app/config/examples";
import { Callout } from "../callout";
import { CodeBlock } from "../code-block";
import { CONFIG_LAYERS } from "../layers-data";
import { Lede } from "../lede";
import { Section } from "../section";
import { Strong } from "../strong";

export function LayersSection() {
  return (
    <Section
      id="layers"
      title="Config layers"
      description={
        <>
          A project&rsquo;s settings can come from three files. lpm merges them
          every time it loads the project, so your team can share one setup
          while you keep personal tweaks out of the repo. Higher layers win.
        </>
      }
    >
      <ol className="mb-6 space-y-2">
        {CONFIG_LAYERS.map((layer, i) => (
          <li
            key={layer.tab}
            className="flex gap-3 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-xs"
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-semibold text-gray-600 dark:text-gray-300"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {layer.name}
                </span>
                <code className="font-mono text-[11px] text-gray-500 dark:text-gray-400 break-all">
                  {layer.path}
                </code>
              </div>
              <p className="mt-1 text-gray-500 dark:text-gray-400 leading-relaxed">
                {layer.holds}. {layer.scope}. The{" "}
                <Strong>{layer.tab}</Strong>{" "}tab in the app&rsquo;s config
                editor.
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Lede title="Sharing a setup with your team." className="mb-3">
        Commit a <code className="font-mono">.lpm.yml</code>{" "}at the root of the
        repository. Anyone who adds the folder to lpm gets its services,
        actions, terminals, and profiles — no{" "}
        <code className="font-mono">name</code>{" "}or{" "}
        <code className="font-mono">root</code>{" "}needed, since those come from
        each person&rsquo;s own project file:
      </Lede>
      <CodeBlock filename="~/Projects/shop/.lpm.yml">{REPO_EXAMPLE}</CodeBlock>

      <Lede title="Overriding one field." className="mt-6 mb-3">
        Entries with the same key merge field by field: whatever the higher
        layer sets wins, and anything it leaves out comes from the layer
        below. To run the shared <code className="font-mono">web</code>{" "}
        service on another port, override its command and port in your own
        file — everything else about it still comes from the repo:
      </Lede>
      <CodeBlock filename="~/.lpm/projects/shop.yml">
        {REPO_OVERRIDE_EXAMPLE}
      </CodeBlock>

      <Callout title="Good to know">
        <p>
          Maps like <code className="font-mono">env</code>{" "}are replaced whole,
          not merged key by key — if you override{" "}
          <code className="font-mono">env</code>, repeat every variable you
          still need. An overridden service doesn&rsquo;t inherit the lower
          layer&rsquo;s <code className="font-mono">dependsOn</code>, a profile
          with the same name replaces the lower one outright, and an
          action&rsquo;s{" "}
          <code className="font-mono">confirm: true</code>{" "}can&rsquo;t be
          switched off from a higher layer.
        </p>
        <p>
          The repo layer applies to local projects only; SSH projects have no{" "}
          <code className="font-mono">.lpm.yml</code>. A duplicate also inherits
          from the project it was copied from, which sits between your file and
          the repo layer.
        </p>
      </Callout>
    </Section>
  );
}
