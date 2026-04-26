import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "You stop hand-typing `ssh -L` for every remote dev server.",
    body: "Declared service ports auto-forward at start. Ad-hoc binds — a compose port, a one-off debug server — surface as one-click suggestions in the Ports popover the moment they appear on the remote. The success toast only fires when localhost:<port> actually accepts a connection, so the link in the toast works the first time.",
  },
  {
    title:
      "You stop re-entering host, user, port, and key data your `~/.ssh/config` already knows.",
    body: "The picker reads your existing hosts and keeps the selected Host alias intact, so OpenSSH can still apply alias-scoped options such as HostName, ProxyJump, ProxyCommand, Port, and IdentityFile. Creating a new SSH project drops to four clicks: pick host, confirm, save, start. The ~/.ssh/config file stays the source of truth.",
  },
  {
    title: "You stop juggling a local terminal and a remote SSH window.",
    body: "Local services and remote services run in adjacent panes inside one native Mac window. Switching between projects (prod, staging, your local copy) is one sidebar click; running state is preserved per project. The split between \"local terminal\" and \"ssh session\" stops existing as a UI concept.",
  },
  {
    title: "You stop losing forwards and tunnels when something restarts.",
    body: "Forwards are owned by the project. Stop the project and every forward dies cleanly. Restart and lpm re-establishes them. Quit the app and nothing leaks — no orphan ssh processes hiding in ps, no lsof archaeology to find a tunnel you started yesterday.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The remote-dev difference"
          title="What changes when your terminal speaks SSH the way you do"
          description="Four concrete wins for Mac developers whose work crosses the SSH boundary."
        />
        <ol className="space-y-10">
          {OUTCOMES.map(({ title, body }, i) => (
            <li
              key={title}
              className="grid grid-cols-[auto_1fr] gap-x-6 sm:gap-x-8 items-start"
            >
              <span
                aria-hidden="true"
                className="text-4xl sm:text-5xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {title}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
