import { CodeBlock } from "@/components/config/code-block";
import { QuickAnswer } from "@/components/vs/quick-answer";

const ANSWER_YAML = `name: myapp
root: ~/Projects/myapp

services:
  web: npm run dev
  api: go run ./cmd/server
  db: docker compose up postgres`;

export default function ShortAnswer() {
  return (
    <QuickAnswer question="Is there a tmux alternative for running a local dev stack on a Mac?">
      <p>
        Yes, if what you want from tmux is one pane per service. lpm is a macOS
        app that starts every service in a project at once, each in its own live
        pane, from a short service list instead of a{" "}
        <code>.tmux.conf</code>. It does not use tmux and does not need it
        installed — quit lpm and your dev servers keep running; reopen it and
        it finds them again.
      </p>
      <p>
        Each pane keeps 10,000 lines of scrollback, and you restart one service
        with <code>lpm service web restart</code>{" "}
        instead of respawning a pane by hand. When the repo has a package.json
        dev script, a Procfile, a Rails Gemfile or a go.mod, lpm writes that
        list itself as you add the folder; anything it misses is a service name
        and a command, so{" "}
        <a
          href="#migrate"
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          translating
        </a>{" "}
        a tmuxinator window list takes about a minute.
      </p>
      <CodeBlock filename="~/.lpm/projects/myapp.yml">{ANSWER_YAML}</CodeBlock>
      <p>
        Then press Start, or run <code>lpm start myapp</code> from any terminal
        while the app is open. tmux is still the better answer for a session
        that lives on a remote box, for vim splits, and for anything you have
        already bound to a key — this page is about the one job the two tools
        overlap on.
      </p>
    </QuickAnswer>
  );
}
