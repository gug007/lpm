import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

const ROWS = [
  {
    label: "The server",
    body: "Ubuntu 22.04 or newer, or a Debian release with the same glibc, on x86_64 (amd64), with curl or wget to download the bundle. The installer uses apt and checks the glibc version before it changes anything. ARM servers are not supported yet.",
  },
  {
    label: "The login",
    body: "Key-based SSH as root, or as a user with passwordless sudo, like the default ubuntu@ or debian@ login on most cloud images. lpm itself runs as root on the server. No password prompt can be answered during setup, so your key or ssh-agent has to be enough on its own.",
  },
  {
    label: "Boot and containers",
    body: "With systemd, lpm installs as a service that starts at boot. In a container with no service manager, the installer sets up an lpm-host supervisor instead, which you start again after the container restarts.",
  },
  {
    label: "The size",
    body: "lpm runs its normal app on the server without a screen, so the installer pulls in a virtual display and the GTK and WebKit runtime behind it, and lpm wants a few hundred megabytes of memory. A 2 GB / 2 vCPU box is a comfortable floor before your own services.",
  },
  {
    label: "The cost",
    body: "Whatever a VPS that size costs from your provider; it is usually one of their smaller plans. A spare desktop or an old workstation on your own network does the same job for the price of the electricity.",
  },
  {
    label: "Still yours to install",
    body: "Your toolchain — git, Node, the agent CLIs, whatever your project builds with. lpm sets itself up, not your stack, and it does not guess at what you build with.",
  },
  {
    label: "Signing in there",
    body: "Open a terminal on the server from lpm and run Claude Code's or Codex's own sign-in there. If a login flow wants a browser on the machine itself, an API key in the server's environment is the simpler route — often the better one for a machine you share.",
  },
];

export default function Requirements() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Before you add one"
          title="What the server needs"
          description="Short list, and most of it is what any cloud image already gives you."
        />

        <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {ROWS.map(({ label, body }) => (
            <div key={label} className="p-5 sm:flex sm:gap-6 sm:p-6">
              <dt className="text-sm font-semibold text-gray-900 sm:w-44 sm:flex-shrink-0 dark:text-gray-100">
                {label}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 sm:mt-0 dark:text-gray-400">
                {body}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10">
          <p className="mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            You never have to run the installer or move a pairing secret by hand
            — but if you would rather set the server up yourself, the same
            bundle the Mac installs is published with every release, and it
            installs the same way:
          </p>
          <CodeBlock filename="On the server, by hand">
            URL=https://github.com/gug007/lpm/releases/latest/download{"\n"}
            curl -fsSL $URL/lpm-host-linux-amd64.tar.gz | tar xz{"\n"}
            cd lpm-host{"\n"}
            sudo ./install.sh{"\n"}
            sudo -H lpm pair
          </CodeBlock>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            That last command prints an invite to paste into Settings →
            Connections on your Mac; logged in as root, plain lpm pair does the
            same. It is the handshake the one-field flow performs for you.
          </p>
        </div>
      </div>
    </section>
  );
}
