import SetupSteps from "./setup-steps";

export default function Hero() {
  return (
    <section className="pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)] text-center">
      <div className="max-w-4xl mx-auto px-6">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400 mb-5">
          The lpm companion for iPhone, iPad &amp; Android
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Control Claude Code and Codex on your computer from your phone.
        </h1>
        <p className="mt-5 text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          lpm Link, the lpm app for iPhone, iPad and Android, pairs with lpm on your
          computer and puts every terminal in your pocket, live on whichever screen has
          control. Prompt Claude Code, Codex, or any
          running agent with a real composer, review and push the diff it just
          wrote, and get an encrypted alert the moment it&rsquo;s waiting on
          you.
        </p>
      </div>
      <SetupSteps />
    </section>
  );
}
