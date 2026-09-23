import { SectionHeader } from "@/components/section-header";

type Step = {
  n: number;
  title: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: "Install lpm on your Mac",
    body: (
      <>
        Download the native macOS app and open your projects as usual. The
        phone talks to this app, which is where every terminal and agent
        actually runs. A Linux server running lpm works the same way.
      </>
    ),
  },
  {
    n: 2,
    title: "Add a device and scan the QR code",
    body: (
      <>
        In <strong>Settings → Mobile devices</strong>{" "}
        on your Mac, turn on Remote control and add a device to reveal a one-time QR code. Scan it
        with lpm Link on your iPhone or iPad. On the same Wi-Fi you can instead
        tap your Mac in the app&rsquo;s nearby list and approve the matching
        code. No account, no sign-in.
      </>
    ),
  },
  {
    n: 3,
    title: "Your projects appear on your phone",
    body: (
      <>
        The phone lists every project and terminal. Open a terminal, tap Take
        control if your Mac is showing it, and it streams here, ready to type
        into. Start and stop projects right from the list.
      </>
    ),
  },
  {
    n: 4,
    title: "Stay in the loop anywhere",
    body: (
      <>
        On the same Wi-Fi it just works. Away from home, put both devices on a{" "}
        <a
          href="https://tailscale.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-gray-300 dark:decoration-gray-600 hover:text-gray-900 dark:hover:text-white"
        >
          Tailscale
        </a>{" "}
        tailnet. The QR code carries both your local and tailnet addresses, so
        the app connects over whichever one it can reach — your terminals follow
        you.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Pairing takes a minute"
          title="From download to controlling your Mac from your phone"
        />
        <ol className="space-y-6">
          {STEPS.map(({ n, title, body }) => (
            <li
              key={n}
              className="flex gap-5 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent"
            >
              <span className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold">
                {n}
              </span>
              <div>
                <h3 className="text-sm font-semibold mb-1.5 text-gray-900 dark:text-gray-100">
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
