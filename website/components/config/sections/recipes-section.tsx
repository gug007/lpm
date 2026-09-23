import {
  RECIPE_ENV,
  RECIPE_MINIMAL,
  RECIPE_MONOREPO,
  RECIPE_NEXT_NODE,
  RECIPE_TESTS,
} from "@/app/config/examples";
import { Callout } from "../callout";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";
import { Strong } from "../strong";

export function RecipesSection() {
  return (
    <Section
      id="recipes"
      title="Recipes"
      description={
        <>
          Full working configs you can copy and adapt. The sections above each
          show <Strong>one concept in isolation</Strong>; the recipes here
          stitch services and actions together into configs that mirror how a
          real project looks on day one. Find the one closest to your stack,
          paste it into a new project, and tweak from there.
        </>
      }
    >
      <Lede title="Minimal blog." className="mb-3">
        Start here if you just want one dev server and nothing else — a
        personal blog, a tiny side project, the &ldquo;hello world&rdquo;
        version of lpm. One service, no actions, no ceremony.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/blog.yml"
        initial={RECIPE_MINIMAL}
      />

      <Lede title="Blog with tests and linting.">
        Add this when your tests, linter, or build start taking long enough
        that retyping them feels wasteful. Same dev server as above, plus three
        one-click buttons in the toolbar.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/blog.yml"
        initial={RECIPE_TESTS}
      />

      <Lede title="Next.js plus a Node API.">
        For the classic two-process web app: a Next.js front-end in the project
        root and a Node backend in <code className="font-mono">./server</code>.
        Shows how to set <code className="font-mono">cwd</code>{" "}per service,
        label a port, add a guarded deploy, and pin a log tail to its own
        terminal tab.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/webapp.yml"
        initial={RECIPE_NEXT_NODE}
      />

      <Lede title="Next.js with dev env vars.">
        Pick this when your app needs a handful of environment variables to
        boot locally and you&rsquo;re tired of remembering them. lpm sets them
        every time the service starts — keep real secrets in your own{" "}
        <code className="font-mono">.env</code>{" "}file, not here.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/webapp.yml"
        initial={RECIPE_ENV}
      />

      <Lede title="Monorepo with an app and docs.">
        For a repo that holds more than one thing you want running at once —
        say an app in <code className="font-mono">apps/web</code>{" "}and a docs
        site in <code className="font-mono">apps/docs</code>. Both services
        live under one project and start together, each from its own folder.
      </Lede>
      <ConfigPlayground
        filename="~/.lpm/projects/mono.yml"
        initial={RECIPE_MONOREPO}
      />

      <Callout title="How to use a recipe" className="mt-8 mb-4">
        <p>
          Copy the one closest to your stack, change{" "}
          <code className="font-mono">name</code>{" "}and{" "}
          <code className="font-mono">root</code>{" "}to match your project, then
          swap in your own commands. If a piece looks unfamiliar, jump back to
          the matching section above and tinker with its playground — your
          edits stay live until you reload.
        </p>
      </Callout>
    </Section>
  );
}
