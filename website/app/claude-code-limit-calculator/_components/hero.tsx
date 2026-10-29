export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)]">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(circle_at_24%_10%,rgba(217,119,87,0.16),transparent_32%),radial-gradient(circle_at_76%_8%,rgba(16,163,127,0.13),transparent_30%)] dark:bg-[radial-gradient(circle_at_24%_10%,rgba(217,119,87,0.2),transparent_32%),radial-gradient(circle_at_76%_8%,rgba(16,163,127,0.17),transparent_30%)]"
      />
      <div className="max-w-4xl mx-auto px-6 text-center">
        <p className="mb-5 text-xs font-medium uppercase tracking-[0.25em] text-gray-600 dark:text-gray-400">
          Free limit calculator
        </p>
        <h1 className="text-balance text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Will you hit your Claude Code limit before it resets?
        </h1>
        <p className="mt-5 text-pretty text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Set how much of your 5-hour or weekly limit you&apos;ve used and how
          long ago the window started. You&apos;ll see your pace and, if
          you&apos;re going too fast, when you&apos;ll run out. Works for Codex
          too.
        </p>
      </div>
    </section>
  );
}
