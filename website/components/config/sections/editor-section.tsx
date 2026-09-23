import { Code, ListChecks, Sparkles } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SKILLS_PATH } from "@/lib/links";
import { DocLink } from "../doc-link";
import { Lede } from "../lede";
import { Section } from "../section";

export function EditorSection() {
  return (
    <Section
      id="editor"
      title="Editing in the app"
      description={
        <>
          You rarely need a text editor. Open a project&rsquo;s config in lpm
          and you get one tab per layer — User, Repo, and Global — with three
          ways to change it.
        </>
      }
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <FeatureCard icon={ListChecks} title="Form">
          Your project file opens as a form: name, folder, and Claude account,
          then services, actions, terminals, and profiles as fields you fill
          in.
        </FeatureCard>
        <FeatureCard icon={Code} title="Source">
          One click switches to the YAML, with schema hints as you type. ⌘S
          saves, and invalid YAML is refused. Repo and Global always open
          here.
        </FeatureCard>
        <FeatureCard icon={Sparkles} title="Generate with AI">
          Pick an installed AI CLI — Claude Code, Codex, Gemini, or OpenCode —
          and it drafts a config from your project. The draft lands unsaved,
          so you review it first.
        </FeatureCard>
      </div>

      <Lede title="From the terminal." className="mb-0">
        <code className="font-mono">lpm config validate &lt;file&gt;</code>{" "}
        checks a project, repo, global, or template file (see{" "}
        <DocLink href="#validation">Validation</DocLink>). Turn on Agent tools
        in Settings and coding agents like Claude Code and Codex can write
        and apply configs for you — see{" "}
        <DocLink href={SKILLS_PATH}>lpm skills for Claude Code and Codex</DocLink>
        .
      </Lede>
    </Section>
  );
}
