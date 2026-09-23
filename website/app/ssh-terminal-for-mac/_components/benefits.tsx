import { SectionHeader } from "@/components/section-header";

type Outcome = {
  title: string;
  body: string;
};

const OUTCOMES: Outcome[] = [
  {
    title: "You stop hand-typing a port-forward command for every remote dev server.",
    body: "Declared service ports forward automatically as soon as the remote server starts listening. Ad-hoc binds, like a compose port or a one-off debug server, show up as one-click suggestions in the Ports popover. The success toast appears only once the local address actually answers, so the link in the toast works the first time.",
  },
  {
    title:
      "You stop re-entering host, user, port, and key data your SSH config already knows.",
    body: "The picker reads your existing hosts and keeps the selected Host alias intact, so OpenSSH can still apply alias-scoped options such as HostName, ProxyJump, ProxyCommand, Port, and IdentityFile. Adding an SSH project comes down to picking the host, naming the remote folder, and clicking Add project. The ~/.ssh/config file stays the source of truth.",
  },
  {
    title: "You stop juggling a local terminal and a remote SSH window.",
    body: "Remote projects sit in the same sidebar as your local ones, one click apart, and their services stream into panes exactly like local ones. Switching between prod, staging, and your local copy keeps each one's running state. Detach your local project into its own window to watch both side by side.",
  },
  {
    title: "You stop losing forwards and tunnels when something restarts.",
    body: "Forwards belong to the project. Stop the project and every forward closes cleanly; start it again and lpm forwards the declared ports as they come up. If a tunnel dies on its own, the next check forwards a declared port again. Quit the app and nothing leaks: no orphan ssh processes hiding in ps, no lsof archaeology to find a tunnel you started yesterday.",
  },
];

export default function Benefits() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The remote-dev difference"
          title="What changes when your terminal speaks SSH the way you do"
          description="Four wins for Mac developers whose work crosses the SSH boundary."
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
