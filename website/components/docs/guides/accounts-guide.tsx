import { Callout } from "@/components/config/callout";
import { Section } from "@/components/config/section";
import { InstallStepsList } from "@/components/install-steps-list";
import { P } from "@/components/prose";
import type { InstallStep } from "@/lib/install-steps";
import {
  CLAUDE_ACCOUNTS_PATH,
  LIMIT_CALCULATOR_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const ADD: InstallStep[] = [
  {
    text: "Open More, then Settings, and go to Accounts & usage. Your main login is already on the list.",
  },
  {
    text: "Click Add, give the account a name such as Work, and confirm with Add and sign in. Claude Code's own sign-in opens for this account; finish it in your browser.",
  },
  {
    text: "Back in Projects, click the three dots next to a project, then Claude account, and pick the account.",
  },
  {
    text: "New Claude sessions in that project now run on it. A session that is already open keeps the login it started with.",
  },
];

export function AccountsGuide() {
  return (
    <Section
      title="Accounts and usage limits"
      description="Claude Code keeps one login per computer. lpm keeps a separate login for each Claude account, so every project uses the one you choose and you never log out."
    >
      <GuideLesson lesson="multiple-accounts" />

      <DocsHeading id="add">Add an account and give it a project</DocsHeading>
      <InstallStepsList steps={ADD} />

      <DocsHeading id="limits">Watch the limits</DocsHeading>
      <p className={P}>
        The sidebar shows a meter for each account: how much of its 5-hour and
        weekly windows is used, and when each resets. Claude meters need a
        one-click opt-in and a subscription login. Codex has meters of its own.
        Stats adds token totals and an estimated cost at list prices.
      </p>

      <DocsHeading id="switch">Switch when one runs low</DocsHeading>
      <GuideList
        items={[
          "By hand: right-click an account's line in the sidebar and switch to it. The open session keeps its login, and every new one starts on the account you picked.",
          "In the middle of a session: move a running conversation to another account from its tab, on your computer or your phone.",
          "On its own: in Settings, under Accounts & usage, turn on Switch accounts automatically and put your accounts in turn order. New sessions start on the first account that is under 90% of its 5-hour and weekly limits, and return to the first one when it resets.",
        ]}
      />
      <GuideLesson lesson="accounts-switching" />
      <Callout title="Before you turn on automatic switching">
        <p>
          lpm asks you to confirm that each account is yours alone. Anthropic
          hasn&rsquo;t said whether switching between accounts is allowed.
        </p>
      </Callout>

      <GuideMore
        links={[
          { href: CLAUDE_ACCOUNTS_PATH, label: "several Claude Code accounts" },
          { href: TOKEN_USAGE_PATH, label: "token usage and limits" },
          { href: LIMIT_CALCULATOR_PATH, label: "the limit calculator" },
        ]}
      />
    </Section>
  );
}
