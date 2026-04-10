import { Monitor, RefreshCw, Terminal, type LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Terminal,
    title: "CLI",
    body: "Fast and scriptable. Manage projects directly from your terminal with simple commands.",
  },
  {
    icon: Monitor,
    title: "Desktop App",
    body: "Visual and intuitive. See live output, edit configs, and manage everything from a native macOS app.",
  },
];

export function TwoWays() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Your choice"
          title="CLI and desktop app, one workflow"
          description="Use the CLI, the desktop app, or both. They share the same config, the same state, and the same functionality. Start a project from the app, stop it from the terminal — everything stays in sync."
          className="mb-12"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group p-8 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-none hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-all duration-200 text-center"
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 mx-auto mb-5 group-hover:bg-gray-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-gray-900 transition-colors duration-200">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-600 tracking-wide flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Same features, always in sync — mix and match freely
        </p>
      </div>
    </section>
  );
}
