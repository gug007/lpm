import {
  ClipboardCopy,
  Columns2,
  ImagePlus,
  Link2,
  Palette,
  Pin,
  Search,
  SquareArrowOutUpRight,
  TerminalSquare,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const BASICS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: TerminalSquare,
    title: "Your login shell",
    body: "zsh, bash, or fish with your dotfiles, prompt, and version managers, starting in the project folder.",
  },
  {
    icon: Columns2,
    title: "Split panes",
    body: "⌘D splits right, ⌘⇧D splits down. Drag tabs between panes; each project remembers its layout.",
  },
  {
    icon: Search,
    title: "Find and filter",
    body: "⌘F searches a terminal or log. Filter mode hides every line that doesn't match.",
  },
  {
    icon: Palette,
    title: "Themes and fonts",
    body: "Eight color themes, including Dracula, Nord, and One Dark, any installed monospace font, and ⌘+ / ⌘− to resize.",
  },
  {
    icon: Link2,
    title: "Clickable paths and links",
    body: "Click src/app.ts:42:7 in the output to open the file at that line. URLs open in your browser.",
  },
  {
    icon: ClipboardCopy,
    title: "Copy that pastes clean",
    body: "Copying rejoins wrapped lines and strips the margin bars agents draw, so pasted code stays code.",
  },
  {
    icon: ImagePlus,
    title: "Paste a screenshot",
    body: "Paste an image into a terminal and lpm saves it and types the path, ready for an agent to read.",
  },
  {
    icon: Pin,
    title: "Pinned tabs and undo close",
    body: "Pin a tab so ⌘W can't close it, and bring back a closed tab with its scrollback from the Undo toast.",
  },
  {
    icon: SquareArrowOutUpRight,
    title: "A window per project",
    body: "Detach a local project into its own window and put it on another display. Take control moves any terminal to the window you're in.",
  },
];

export default function TerminalBasics() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Terminal basics"
          title="Everything you expect from a Mac terminal"
          description="lpm's panes are real terminals, rendered on the GPU with 24-bit color. The everyday tools are all there."
          className="mb-12"
        />
        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {BASICS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-white/[0.06]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
