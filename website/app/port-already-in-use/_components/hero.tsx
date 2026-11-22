const ERRORS = [
  { tool: "Node", line: "Error: listen EADDRINUSE: address already in use :::3000" },
  {
    tool: "Rails",
    line: 'Address already in use - bind(2) for "127.0.0.1" port 3000 (Errno::EADDRINUSE)',
  },
  { tool: "Django", line: "Error: That port is already in use." },
  { tool: "Next.js", line: "⚠ Port 3000 is in use, trying 3001 instead." },
];

export default function Hero() {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-10 text-center">
      <div className="mx-auto max-w-4xl px-6">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-sky-700/80 dark:text-sky-300/80">
          Dev servers
        </p>
        <h1 className="text-balance text-[2.25rem] font-extrabold leading-[1.06] tracking-tight text-gray-900 sm:text-5xl md:text-[3.5rem] dark:text-white">
          Port 3000 is already in use? Free it in one line.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-gray-600 sm:text-[17px] dark:text-gray-400">
          Something else is still listening on the port your dev server wants:
          usually an old copy of the same server, left running in another tab.
          Find it, stop it, and start again. The commands for macOS, Linux and
          Windows are below.
        </p>
        <div
          data-on-dark
          className="mx-auto mt-8 max-w-2xl overflow-hidden rounded-xl bg-[#111] text-left"
        >
          <div className="border-b border-white/10 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
            What it looks like
          </div>
          <ul className="divide-y divide-white/5">
            {ERRORS.map(({ tool, line }) => (
              <li key={tool} className="flex gap-3 px-4 py-2.5 font-mono text-[12.5px]">
                <span className="w-14 shrink-0 text-gray-500">{tool}</span>
                <span className="min-w-0 break-words text-red-300">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
