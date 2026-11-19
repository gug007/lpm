import { DocLink } from "@/components/config/doc-link";
import { Section } from "@/components/config/section";
import { InstallStepsList } from "@/components/install-steps-list";
import { LINK, P } from "@/components/prose";
import { STATUS_AGENT_NAMES } from "@/lib/app-facts";
import { docsPath } from "@/lib/docs-pages";
import type { InstallStep } from "@/lib/install-steps";
import { APP_STORE_URL, MOBILE_PATH, PLAY_STORE_URL } from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const PAIR: InstallStep[] = [
  {
    text: "On your computer, click + above your projects, choose Phone, and turn on Remote control. Phone access is off until you do.",
  },
  {
    text: "Open lpm Link on the phone. Your computer shows up under On this Wi-Fi: tap it, or scan the QR code the computer shows.",
  },
  {
    text: "The computer asks to let this phone in. Check that the codes on both screens match, then click Allow.",
  },
  {
    text: "Your projects are on the phone. Open a terminal tab and tap Take control to type into it; Take control on the computer moves it back.",
  },
];

export function PhoneGuide() {
  return (
    <Section
      title="lpm Link on your phone"
      description="lpm Link is the free app for iPhone, iPad and Android. It shows your terminals live, sends prompts, and tells you when an agent needs you. Everything still runs on your computer."
    >
      <GuideLesson lesson="connect-iphone" />

      <DocsHeading id="install">Get the app</DocsHeading>
      <p className={P}>
        lpm Link is on the{" "}
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          App Store
        </a>{" "}
        for iPhone and iPad, and on{" "}
        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          Google Play
        </a>{" "}
        for Android. It has a demo with sample projects, so you can look
        around before pairing anything.
      </p>

      <DocsHeading id="pair">Pair it with your computer</DocsHeading>
      <InstallStepsList steps={PAIR} />

      <DocsHeading id="away">Reach home from anywhere</DocsHeading>
      <p className={P}>
        On your own Wi-Fi the phone reaches the computer directly. Away from
        home, set up Built-in Tailscale on both: one private network for your
        computer and your phone, encrypted end to end, with no Tailscale app
        to install and no ports to open. Sign in with the same Tailscale
        account on each. lpm Link then connects over it on its own.
      </p>

      <DocsHeading id="do">What you can do from the phone</DocsHeading>
      <GuideList
        items={[
          <>
            See which agent is working, done or waiting, and get a push when
            one needs you. Alerts come from {STATUS_AGENT_NAMES}.
          </>,
          "Write prompts in a real composer, with photos, files, / commands and @ mentions. Drafts sync with the same terminal on your computer.",
          "Review uncommitted diffs, commit with an AI-written message, pull, push, and open a GitHub pull request.",
          "Start and stop projects, run actions, and make copies of a project.",
          <>
            Create, run, pause and answer{" "}
            <DocLink href={docsPath("automations")}>automations</DocLink>, and
            check Claude and Codex usage limits.
          </>,
        ]}
      />

      <DocsHeading id="good-to-know">Good to know</DocsHeading>
      <GuideList
        items={[
          "The computer has to be awake, with lpm open. Keep awake stops it from sleeping while agents work.",
          "A push is encrypted on your computer, and only your phone can read it.",
          "You can pair several computers and Linux servers, and switch between them in the app.",
        ]}
      />

      <GuideMore links={[{ href: MOBILE_PATH, label: "everything lpm Link does" }]} />
    </Section>
  );
}
