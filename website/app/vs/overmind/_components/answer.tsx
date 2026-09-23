import { CodeBlock } from "@/components/config/code-block";
import { QuickAnswer } from "@/components/vs/quick-answer";

const ANSWER_QUESTION =
  "Is there an Overmind alternative for Mac that does not need tmux?";

const CONVERSION = `web: bundle exec puma -C config/puma.rb      →  services:
worker: bundle exec sidekiq                       web:
css: bun run watch:css                              cmd: bundle exec puma -C config/puma.rb
                                                    port: 3000
                                                  worker:
                                                    cmd: bundle exec sidekiq
                                                    dependsOn: [web]
                                                  css: bun run watch:css`;

const CODE = "font-mono text-[0.9em]";

export function Answer() {
  return (
    <QuickAnswer question={ANSWER_QUESTION}>
      <p>
        Yes. Overmind here means DarthSim/overmind, the Procfile runner linked
        above, which drives each of your services as a tmux window. Its README
        is explicit that tmux is a prerequisite you install first.
      </p>
      <p>
        lpm does the same job from a native Mac app. Each process in your
        config lands in a pane of its own, holding its last 10,000 lines, and
        you can stop and start any one of them without touching the rest, or
        run <code className={CODE}>lpm service web restart</code>. One that
        crashes stays down, its output kept. Those panes are for reading
        rather than typing — dropping you at a prompt inside a running process
        is the one thing <code>overmind connect</code> does that lpm has no
        answer for. Nothing here runs on tmux, so there is no multiplexer to
        install first. Your Procfile stays where it is: lpm imports its lines
        once, when you add the folder, and the shape carries over unchanged.
      </p>
      <p>
        What you give up: lpm reads the Procfile once rather than on every
        start, will not hand each process a{" "}
        <code className={CODE}>PORT</code>, will not run two copies of one
        process, and needs a Mac to drive it. Everything else on this page is
        what you get in exchange.
      </p>
      <CodeBlock filename="Procfile → ~/.lpm/projects/myapp.yml">
        {CONVERSION}
      </CodeBlock>
    </QuickAnswer>
  );
}
