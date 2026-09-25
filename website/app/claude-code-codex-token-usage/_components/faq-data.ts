export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "How do I check my Claude Code usage?",
    answer:
      "Run /usage in Claude Code. On a Pro, Max, Team or Enterprise plan it shows your plan usage bars with reset times and a breakdown of what used your limits; with an API key it shows the session's tokens and cost. You can also open claude.ai Settings > Usage, or, on Pro and Max, put the 5-hour and weekly percentages in your statusline. On Pro and Max, lpm shows the same two windows as live meters with a pace verdict, next to your token totals by project.",
  },
  {
    question:
      "What's the difference between /usage, /cost and /stats in Claude Code?",
    answer:
      "There isn't one anymore. Since Claude Code 2.1.118, /cost and /stats are aliases of /usage. /stats opens the same screen on its Stats tab, where r switches between Last 7 days, Last 30 days and All time. The dollar figure is an estimate at list prices, and on a subscription it isn't what you're billed.",
  },
  {
    question: "How do I check my Codex usage and rate limits?",
    answer:
      "In Codex CLI, run /status. It lists the limits your plan reports, usually a 5-hour and a weekly window, as percent left with reset times. /statusline pins limit items to the footer, and /usage shows daily, weekly or cumulative token activity when you're signed in with ChatGPT. On the web, open chatgpt.com/codex/settings/usage. lpm reads Codex limits with no setup and shows them as percent used, beside Claude's.",
  },
  {
    question: "How does the Claude Code 5-hour limit work?",
    answer:
      "On a Claude subscription, usage counts against a session window that resets every five hours and a weekly limit across all models. Both are shared with claude.ai, Claude Desktop and the IDE extensions, and Anthropic doesn't publish a token number for either. Max 5x and Max 20x give five and 20 times Pro's per-session allowance. An API-key login has no plan windows: you pay per token, and lpm's Claude card says there are no limits to show.",
  },
  {
    question: "When does the Claude Code weekly limit reset?",
    answer:
      "At a fixed day and time each week that Anthropic assigns to your account, not seven days after you start. /usage and claude.ai Settings > Usage show the next reset. In lpm, the Weekly meter shows it as a countdown and a date, such as “resets in 3d 19h · Sep 27, 4:30 PM”, and the sidebar meter shows the weekly window by default.",
  },
  {
    question: "Does Claude Code share usage limits with claude.ai?",
    answer:
      "Yes. Claude Code, claude.ai, Claude Desktop and the IDE extensions draw on one plan allowance. lpm's 5-hour and weekly meters include your claude.ai use too, because the percentages come from Claude Code itself. A separate Fable weekly limit, if your plan has one, shows in /usage and claude.ai Settings > Usage, not in lpm. Its Stats view counts only the Claude Code and Codex sessions on this Mac, so claude.ai chats use up your limit without appearing in Stats.",
  },
  {
    question: "What can I do when I hit my Claude Code or Codex usage limit?",
    answer:
      "Wait for the reset, use a free reset if you have one, or pay to keep going. Claude Code 2.1.234 and later can wait in the open session and continue the interrupted task after the reset. Anthropic occasionally gives eligible plans a free limit reset, used from Settings > Usage on claude.ai or in Claude Desktop, and Pro and Max can turn on usage credits or upgrade. When Codex hits a limit, the current turn finishes; you can redeem an earned reset from /usage if you have one, Plus and Pro can buy credits, or you can switch to an API key. In lpm, press ⌥↵ and choose Limit resets: your next prompt goes out 30 seconds after the window resets, once the agent is idle, in a local Claude Code or Codex terminal.",
  },
  {
    question: "How much does Claude Code cost, and is lpm's estimate my bill?",
    answer:
      "Claude Code comes with Claude's Pro and Max plans, which cost $20, $100 or $200 a month in the US as of September 2026; with an API key you pay per token instead. lpm's figure is not a bill. It's what your tokens would cost at the API list prices built into lpm for each model, with cache reads and writes priced separately, so it can lag behind price changes, and Codex prices are approximate. On a subscription, treat it as a yardstick for how heavy your usage is.",
  },
  {
    question: "Can I see Claude Code token usage by project?",
    answer:
      "Yes. lpm's Stats view matches the Claude Code and Codex sessions on this Mac to the lpm project whose folder it ran in, including sessions started from another terminal or editor and ones from before you installed lpm. Copies and worktrees you make in lpm are projects of their own, so their tokens are counted separately; when project folders nest, the deepest one gets the session. Sort projects by tokens, sessions or name, and open a recent session to see its input, cached, output and reasoning tokens. SSH projects and projects on other Macs or Linux servers aren't counted.",
  },
  {
    question: "What do ahead of pace, on pace and under pace mean?",
    answer:
      "lpm divides the share of a window you've used by the share of time that has passed. Above 1.15 is ahead of pace, below 0.85 is under pace, and anything between is on pace; in the first 5% of a window there's no pace verdict, only “limit reached” at 100%. When you're ahead of pace and the current rate would use up the window before it resets, the meter adds an estimate such as “runs out in ~1h 4m, before reset”.",
  },
  {
    question: "Why is Claude Code using so many tokens?",
    answer:
      "Mostly because every request carries the whole conversation. Claude Code re-reads that history from the prompt cache on each turn, so a long session adds up quickly even when your messages are short. Cache reads are priced far below fresh input, which is why a huge total can come with a modest cost estimate. lpm's Input tile shows how much came from cache, and starting a fresh session with /clear when you switch tasks keeps it down.",
  },
  {
    question: "Why don't I see my Claude limits in lpm?",
    answer:
      "Open Usage and press Enable on the Claude card. lpm then wraps the statusline in ~/.claude/settings.json and keeps your existing one running inside it. Limits arrive once a Claude Code session in an lpm terminal gets a reply, and only for Pro and Max logins: Claude Code leaves plan windows out of the statusline data for API-key logins and Team or Enterprise seats, though Stats still counts their tokens. Turning it off restores your previous statusline exactly.",
  },
  {
    question: "Is lpm an alternative to ccusage or CodexBar?",
    answer:
      "It covers similar ground in a different way. ccusage is a command-line report for many agent CLIs, with JSON export and 5-hour blocks estimated from logs. CodexBar is a menu-bar app that fetches limits for many providers through their accounts or browser cookies, even with no CLI running. lpm is the Mac app you run Claude Code and Codex in: it shows the limits the two CLIs report, judges pace, splits tokens by project, and can send a prompt when a limit resets. All three are free and open source.",
  },
  {
    question: "Does lpm send my prompts or usage anywhere?",
    answer:
      "No. Stats reads only the usage fields in Claude Code and Codex session files, not prompts or responses, and the limit meters use what the two CLIs report while they run. lpm doesn't contact Anthropic or OpenAI for these numbers and needs no account. If you pair the lpm iPhone app, it gets the same numbers straight from your Mac over your network or tailnet, with no cloud relay.",
  },
  {
    question: "Why doesn't All time go further back?",
    answer:
      "lpm can only count the session files still on disk, and Claude Code deletes them after 30 days by default. To keep more history, set cleanupPeriodDays in ~/.claude/settings.json to a larger number, such as 365. Codex keeps its session files, but lpm reads only ~/.codex/sessions, so archived sessions and sessions under a custom CODEX_HOME aren't counted.",
  },
];
