import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { faqJsonLd, jsonLdString } from "@/lib/structured-data";

const FAQS = [
  {
    question: "What is a Claude Code skill?",
    answer:
      "A skill is a folder with a SKILL.md file: a short description the agent always sees, and instructions it reads only when the task matches. Claude Code loads skills from ~/.claude/skills and from .claude/skills inside a project; Codex reads its own folders. lpm scans all of them and lists what each CLI can use.",
  },
  {
    question: "How do I create a Claude Code skill in lpm?",
    answer:
      "Open a project and press ⌘⇧K — or choose Skills & tools from the ˅ menu next to the terminal tabs — then click New skill. Name it, pick the folder for the CLI you want, choose who runs it, and write the description and instructions — or describe the task in one sentence and let AI draft every field.",
  },
  {
    question: "Can AI write the skill for me?",
    answer:
      "Yes. Describe what the skill should do and click Draft. lpm reads your repository without changing it and fills in a suggested name, description, and instructions that match how your project works. Drafting only fills the form — nothing is written to disk until you click Create skill.",
  },
  {
    question: "Does it work with Codex?",
    answer:
      "Yes. The same dialog writes Codex skills to ~/.codex/skills or the shared ~/.agents/skills folder. Codex invokes skills with $name instead of /name, and lpm shows the right invocation for whichever folder you pick.",
  },
  {
    question: "Can I use one skill with both Claude Code and Codex?",
    answer:
      "Each CLI reads its own folders, so a skill lives where its CLI looks: Claude Code reads ~/.claude/skills and a project's .claude/skills, while Codex reads ~/.codex/skills and the shared ~/.agents/skills folder that other agent CLIs read too. The dialog is identical either way — pick a different folder and lpm writes the same SKILL.md format there.",
  },
  {
    question: "What does the “Only you” run mode mean?",
    answer:
      "A manual-only skill never triggers on its own and stays out of the agent's context, so it costs no tokens until you invoke it by name. lpm can mark skills manual-only for both Claude Code and Codex.",
  },
  {
    question: "Can I edit skills I wrote by hand?",
    answer:
      "Yes. Reopen any skill and change its description, instructions, or run mode. lpm rewrites only the fields you touched, so custom frontmatter, comments, and formatting in hand-written files survive edits untouched.",
  },
  {
    question: "Where is everything stored?",
    answer:
      "In the same local folders the CLIs already read — nothing is uploaded or synced to a website. Deleting a skill moves its folder to the macOS Trash, so you can always get it back.",
  },
];

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="What to know about agent skills"
          description="How skills work, what they cost in context, and what lpm writes to disk."
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02] dark:hover:border-gray-700">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 dark:text-gray-100 dark:focus-visible:ring-white [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400" />
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {answer}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd(FAQS)) }}
        />
      </div>
    </section>
  );
}
