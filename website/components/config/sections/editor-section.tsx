import { Code, ListChecks, Sparkles } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
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
          (Ctrl+S on Windows and Linux) saves, and invalid YAML is refused.
          Repo and Global always open here.
        </FeatureCard>
        <FeatureCard icon={Sparkles} title="Generate with AI">
          Pick an installed AI CLI — Claude Code, Codex, Gemini CLI, or
          OpenCode — and it drafts a config from your project. The draft lands
          unsaved, so you review it first.
        </FeatureCard>
      </div>

      <Lede className="mb-0">
        For anything bigger than one field, it&rsquo;s faster to{" "}
        <DocLink href="#with-ai">ask your agent</DocLink>{" "}from a terminal in
        the project. The rest of this page covers every key, for when
        you&rsquo;d rather write it yourself or check what the agent wrote.
      </Lede>
    </Section>
  );
}
