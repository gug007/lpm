import LimitsExplainer from "@/app/claude-code-codex-token-usage/_components/limits-explainer";
import { SectionHeader } from "@/components/section-header";

export default function LimitsSection() {
  return (
    <section id="limits" className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="The windows"
          title="How Claude Code and Codex limits reset"
          description="Both agents count usage against a short window and a weekly one. Here's what each plan does, with links to the rules."
          className="mb-0"
        />
        <LimitsExplainer />
      </div>
    </section>
  );
}
