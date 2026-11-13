import type { ReactNode } from "react";
import { CodeBlock } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

type Step = {
  title: string;
  body: string;
  filename: string;
  code: ReactNode;
};

const STEPS: Step[] = [
  {
    title: "Connect to the server",
    body: "Any Linux box you can reach over SSH works: a VPS, a home server, a spare desktop.",
    filename: "On your computer",
    code: "ssh user@your-server",
  },
  {
    title: "Install Claude Code, Codex, or both",
    body: "Anthropic's installer needs no Node.js. Claude Code supports Ubuntu 20.04 or newer, Debian 10 or newer and Alpine 3.19 or newer, on x64 or ARM64, with at least 4 GB of memory.",
    filename: "On the server",
    code: (
      <>
        curl -fsSL https://claude.ai/install.sh | bash{"\n"}
        curl -fsSL https://chatgpt.com/codex/install.sh | sh
      </>
    ),
  },
  {
    title: "Sign in",
    body: "Start the agent in your project folder and follow its sign-in prompts. With ANTHROPIC_API_KEY set in the server's environment, Claude Code offers to use that key instead.",
    filename: "On the server",
    code: (
      <>
        cd ~/my-project{"\n"}
        claude
      </>
    ),
  },
  {
    title: "Keep it running after you disconnect",
    body: "A plain SSH session takes the agent down with it. Start the agent inside tmux, or add the server to lpm and skip this step: terminals you open there belong to the server, not to your connection.",
    filename: "On the server",
    code: (
      <>
        tmux new -s agent{"\n"}
        claude{"\n"}
        {"# Ctrl+B then D to detach, tmux attach -t agent to come back"}
      </>
    ),
  },
];

export default function InstallOnLinux() {
  return (
    <section id="install" className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Install"
          title="How to install Claude Code on a Linux server"
          description="Claude Code and Codex both run on Linux. On a fresh Ubuntu or Debian server it takes four steps."
        />
        <ol className="space-y-8">
          {STEPS.map(({ title, body, filename, code }, i) => (
            <li key={title}>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                <span className="mr-2 tabular-nums text-gray-400 dark:text-gray-500">
                  {i + 1}.
                </span>
                {title}
              </h3>
              <p className="mt-2 mb-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
              <CodeBlock filename={filename}>{code}</CodeBlock>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          That gets you an agent in a shell. The rest of this page is about what
          a shell leaves out: the project&rsquo;s services and ports, the diff
          the agent wrote, and a badge on your Mac when it needs an answer.
        </p>
      </div>
    </section>
  );
}
