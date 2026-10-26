import { ZONES_EXAMPLE, ZONES_LAYERS_EXAMPLE } from "@/app/config/zone-examples";
import { Callout } from "../callout";
import { DocLink } from "../doc-link";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";

export function ZonesSection() {
  return (
    <Section
      id="zones"
      title="Zones"
      description={
        <>
          When a project grows a dozen buttons, a zone keeps related ones
          together: a framed spot in the header or footer, one to three rows
          tall, that shows its buttons as buttons instead of hiding them in a
          menu. It fills top to bottom, then the next column, and keeps its
          size when it&rsquo;s empty.
        </>
      }
    >
      <Lede title="Declaring a zone." className="mb-3">
        Add an entry under <code className="font-mono">zones</code>{" "}with{" "}
        <code className="font-mono">rows</code>, then set a button&rsquo;s{" "}
        <code className="font-mono">display</code>{" "}to the zone&rsquo;s key.{" "}
        <code className="font-mono">position</code>{" "}orders buttons inside the
        zone, and on the zone itself orders it among the other items of its
        bar. Try changing <code className="font-mono">rows</code>{" "}or{" "}
        <code className="font-mono">display</code>:
      </Lede>
      <ConfigPlayground filename="~/.lpm/projects/myapp.yml" initial={ZONES_EXAMPLE} />

      <Lede title="Layers." className="mt-6 mb-3">
        A zone can hold several sets of buttons and slide between them with
        dots under its frame. List them under{" "}
        <code className="font-mono">layers</code>{" "}and point each button at
        one with <code className="font-mono">layer</code>; a button without
        one lands in the first layer. Zones work in a repo&rsquo;s{" "}
        <code className="font-mono">.lpm.yml</code>{" "}too, so the whole team
        gets the same layout:
      </Lede>
      <ConfigPlayground
        filename="~/Projects/myapp/.lpm.yml"
        initial={ZONES_LAYERS_EXAMPLE}
      />

      <Callout title="Good to know">
        <p>
          <code className="font-mono">collapsed: true</code>{" "}folds a zone into
          a single button that shows the rest on hover. Zones live in your
          project file, <code className="font-mono">.lpm.yml</code>, or{" "}
          <code className="font-mono">global.yml</code>{" "}— not in templates or
          a duplicate&rsquo;s own file. Only top-level actions sit in a zone,
          and a button whose <code className="font-mono">display</code>{" "}names
          a zone that doesn&rsquo;t exist shows in the header.
        </p>
        <p>
          The quickest way to build one is to{" "}
          <DocLink href="#with-ai">ask your agent</DocLink>: &ldquo;Put the iOS
          and Android builds in a two-row zone in the footer.&rdquo;
        </p>
      </Callout>
    </Section>
  );
}
