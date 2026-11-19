import { Laptop, Server, SquareTerminal } from "lucide-react";
import { DocLink } from "@/components/config/doc-link";
import { Section } from "@/components/config/section";
import { FeatureCard } from "@/components/feature-card";
import { InstallStepsList } from "@/components/install-steps-list";
import { docsPath } from "@/lib/docs-pages";
import type { InstallStep } from "@/lib/install-steps";
import {
  LINUX_HOST_PATH,
  MAC_MINI_PATH,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const PAIR: InstallStep[] = [
  {
    text: "Install lpm on both computers. On the one that will do the work, click + above your projects, choose Another computer and turn on Allow control. Then create an invite and copy it.",
  },
  {
    text: "On this computer, click + above your projects and choose Another computer. Paste the invite and click Connect. An invite works once.",
  },
  {
    text: "The other computer's projects appear in your sidebar under its name. Open one: its terminals, services, agents and review all run over there.",
  },
];

const SERVER: InstallStep[] = [
  { text: "Click + above your projects and choose Server." },
  {
    text: "Choose Install lpm there, type what you would type after ssh, such as root@dev-server, and click Connect. On a new server the first setup takes a few minutes.",
  },
  {
    text: "The server gets a section of its own in your sidebar. Add a project there, then open Claude or Codex in it.",
  },
];

export function ComputersGuide() {
  return (
    <Section
      title="Other computers and servers"
      description="Work runs where the project lives, and lpm on this computer is the screen and keyboard. An agent on a machine that stays on keeps working after you close the laptop."
    >
      <GuideLesson lesson="keep-agents-running-on-server" />

      <DocsHeading id="ways">Three ways to reach another machine</DocsHeading>
      <div className="grid gap-3 sm:grid-cols-3">
        <FeatureCard icon={Laptop} title="Another computer">
          Pair two computers that both run lpm. The other one&rsquo;s projects
          show up in your sidebar under its name.
        </FeatureCard>
        <FeatureCard icon={Server} title="A Linux server">
          Type user@server and lpm installs itself there, pairs, and connects
          through SSH. Every project on it shows in your sidebar.
        </FeatureCard>
        <FeatureCard icon={SquareTerminal} title="One folder over SSH">
          Nothing is installed on the server. One folder opens as a project,
          run from your computer.
        </FeatureCard>
      </div>

      <DocsHeading id="pair">Pair another computer</DocsHeading>
      <InstallStepsList steps={PAIR} />

      <DocsHeading id="server">Connect a Linux server</DocsHeading>
      <InstallStepsList steps={SERVER} />
      <div className="mt-6">
        <GuideLesson lesson="claude-code-codex-remote-server" />
      </div>

      <DocsHeading id="good-to-know">Good to know</DocsHeading>
      <GuideList
        items={[
          "Machines connect to each other directly, not through a cloud relay. When both sides run a current lpm, the connection is encrypted and pinned to each machine's identity, and you can revoke a device at any time.",
          "On Windows, turning on Allow control asks for a firewall permission the first time.",
          "A terminal that is open in several places is controlled from one at a time. Take control moves it to the window, computer or phone you are on.",
          "On an SSH project, the ports your services declare forward to localhost. SSH projects can't be duplicated.",
          <>
            To reach the same projects from a phone, pair{" "}
            <DocLink href={docsPath("phone")}>lpm Link</DocLink>{" "}with either
            computer.
          </>,
        ]}
      />

      <GuideMore
        links={[
          { href: MAC_MINI_PATH, label: "agents on a Mac mini" },
          { href: LINUX_HOST_PATH, label: "agents on a Linux server" },
          { href: SSH_TERMINAL_MAC_PATH, label: "SSH projects" },
        ]}
      />
    </Section>
  );
}
