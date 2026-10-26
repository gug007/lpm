import {
  ACTIONS_BACKGROUND_EXAMPLE,
  ACTIONS_DESTRUCTIVE_EXAMPLE,
  ACTIONS_DROPDOWN_EXAMPLE,
  ACTIONS_EXAMPLE,
  ACTIONS_NESTED_EXAMPLE,
  ACTIONS_PRIMARY_EXAMPLE,
  ACTIONS_SHORTHAND_EXAMPLE,
} from "@/app/config/examples";
import { YouTubeVideo } from "@/components/youtube-video";
import { actionFields } from "../action-fields-data";
import { moreActionFields } from "../more-action-fields-data";
import { Callout } from "../callout";
import { FieldTable } from "../field-table";
import { Lede } from "../lede";
import { ConfigPlayground } from "../playground";
import { Section } from "../section";
import { Strong } from "../strong";

const FILE = "~/.lpm/projects/myapp.yml";

export function ActionsSection() {
  return (
    <Section
      id="actions"
      title="Actions"
      description={
        <>
          Actions are the commands you run once in a while — your test suite, a
          database migration, a deploy script. Services run continuously;
          actions fire once, do their job, and show you the result. Each one is
          a button in the project toolbar — or in the footer bar under the
          terminal — and one click runs it.
        </>
      }
    >
      <Lede className="mb-3">
        <span className="hidden md:inline">
          Try it — click <Strong>test</Strong>{" "}or{" "}
          <Strong>Deploy to Production</Strong>{" "}in the app below.{" "}
        </span>
        Actions with <code className="font-mono">confirm: true</code>{" "}ask
        before running; everything else just runs.
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_EXAMPLE} />
      <FieldTable fields={actionFields} />

      <Lede title="More fields." className="mt-8 mb-3">
        The table above covers what the examples on this page use. Actions
        also take these, and the app&rsquo;s action editor sets most of them
        for you:
      </Lede>
      <FieldTable fields={moreActionFields} />

      <Lede title="Dynamic labels." className="mt-8 mb-3">
        A label can keep itself current: the branch with{" "}
        <code className="font-mono">{"{{git.branch}}"}</code>, your last
        release and how long ago it was with <code className="font-mono">{"{{git.tag}}"}</code>{" "}and{" "}
        <code className="font-mono">{"{{git.tagAge}}"}</code>, or whatever a
        command prints with <code className="font-mono">$(…)</code>, refreshed
        on a timer or the moment the code changes. The lesson below sets one
        up and has Claude Code add another:
      </Lede>
      <YouTubeVideo
        lesson="dynamic-action-labels"
        className="mb-6 rounded-xl ring-1 ring-black/5 dark:ring-white/10"
      />

      <Lede title="Shorthand.">
        If all your action needs is a command, write it as a single line — the
        key becomes the label and you skip the nested form entirely. Great for
        everyday dev commands:
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_SHORTHAND_EXAMPLE} />

      <Lede title="Destructive actions.">
        For anything you don&rsquo;t want to click by accident — cache wipes,
        rollbacks, production deploys — add{" "}
        <code className="font-mono">confirm: true</code>{" "}to get a confirmation
        dialog, and pair it with{" "}
        <code className="font-mono">display: header</code>{" "}(the default) so
        the action lives in the toolbar where you&rsquo;ll find it:
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_DESTRUCTIVE_EXAMPLE} />

      <Lede title="Grouping related actions.">
        Give a parent action both a <code className="font-mono">cmd</code>{" "}and
        nested <code className="font-mono">actions</code>{" "}and lpm renders it as
        a split button: the main part runs the parent&rsquo;s command, the
        chevron opens a menu with the children. Use this when there&rsquo;s a
        sensible default plus a few alternatives — like &ldquo;Deploy
        staging&rdquo; with production and preview tucked behind it:
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_NESTED_EXAMPLE} />

      <Lede title="Remembering your last choice.">
        Add <code className="font-mono">primary: last-used</code>{" "}instead of a
        parent <code className="font-mono">cmd</code>{" "}and the main part of the
        split button becomes whichever option you clicked last — deploy to
        staging once, and the button reads &ldquo;Staging&rdquo; until you pick
        something else. Set <code className="font-mono">primary</code>{" "}to a
        child&rsquo;s name (like{" "}
        <code className="font-mono">primary: staging</code>) to pin one option
        as the default instead:
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_PRIMARY_EXAMPLE} />

      <Lede title="Dropdown-only groups.">
        Drop the parent&rsquo;s <code className="font-mono">cmd</code>{" "}and the
        whole button becomes a dropdown. Good for a set of related commands
        with no obvious default — like a database toolkit (Migrate, Seed,
        Reset):
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_DROPDOWN_EXAMPLE} />

      <Lede title="Background actions.">
        For slow, boring commands where the only thing you care about is
        whether they succeeded — builds, migrations, docker pulls,{" "}
        <code className="font-mono">git fetch</code> — add{" "}
        <code className="font-mono">type: background</code>. The command runs
        hidden while a small live card counts the time and keeps its output a
        click away, with Cancel and Copy output, then shows success or failure
        when it&rsquo;s done. No modal to dismiss, no terminal tab to clean up,
        and you can fire several in parallel while you keep working:
      </Lede>
      <ConfigPlayground filename={FILE} initial={ACTIONS_BACKGROUND_EXAMPLE} />

      <Callout title="A note on inheritance">
        <p>
          Nested actions inherit <code className="font-mono">cwd</code>{" "}and{" "}
          <code className="font-mono">env</code>{" "}from their parent unless they
          override them. Set <code className="font-mono">cwd: ./backend</code>{" "}
          on the parent once and every child runs from there — no need to
          repeat yourself.
        </p>
      </Callout>
    </Section>
  );
}
