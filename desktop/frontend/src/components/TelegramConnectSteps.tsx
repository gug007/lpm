import { useState } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { SetupStep as Step } from "./SetupStep";
import { TelegramTokenPaste } from "./TelegramTokenPaste";
import { TelegramChatList } from "./TelegramChatList";
import { BTN_SECONDARY } from "./ui/buttons";
import { useTelegramLink } from "../hooks/useTelegramLink";
import { splitSendTo } from "../sendTo";
import { NEW_BOT_URL, addToChannelUrl, addToGroupUrl, startUrl } from "../telegramLinks";
import type { ConnectorProps } from "../sendToConnectors";

const PRIMARY =
  "rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40";

// Telegram linked in two taps' worth of steps: make a bot (BotFather opens with
// /newbot typed) and paste its reply, then open the bot and tap Start. Adding a
// chat later is Telegram's own "add to group / channel" picker.
export function TelegramConnectSteps({ intent, host, onAdded }: ConnectorProps) {
  const [fresh, setFresh] = useState<string[]>([]);
  const link = useTelegramLink({
    host,
    watch: intent === "add",
    onAdded: (ids) => {
      setFresh((prev) => [...prev, ...ids.map((id) => splitSendTo(id).key ?? id)]);
      onAdded(ids);
    },
  });
  const { status, waiting, busy, bot, problem } = link;
  const hasToken = !!status?.hasToken;
  const connected = !!status?.connected;
  const open = (url: string) => () => BrowserOpenURL(url);

  if (intent === "add" && connected && status?.bot && status.code) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={open(addToGroupUrl(status.bot, status.code))} className={PRIMARY}>
            Add to a group
          </button>
          <button onClick={open(addToChannelUrl(status.bot))} className={BTN_SECONDARY}>
            Add to a channel
          </button>
          <span className="text-[12.5px] text-[var(--text-muted)]">Watching for it…</span>
        </div>
        <p className="text-[12px] leading-5 text-[var(--text-muted)]">
          Telegram asks which group or channel to add {bot} to. If it doesn't, add {bot} from
          the group's or channel's members. Either way, it shows up here once it's in.
        </p>
        <TelegramChatList chats={status.chats} fresh={fresh} />
      </div>
    );
  }

  return (
    <ol className="space-y-5">
      <Step n={1} title="Create a bot" done={hasToken} current={!hasToken}>
        {hasToken ? (
          <p className="text-[12.5px] text-[var(--text-muted)]">
            Using {bot}.{" "}
            <button
              onClick={link.disconnect}
              disabled={busy}
              className="font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Use another bot
            </button>
          </p>
        ) : (
          <>
            <p className="text-[12.5px] leading-5 text-[var(--text-muted)]">
              BotFather opens with /newbot typed. Send it, pick a name and a username, then
              paste BotFather's reply below.
            </p>
            <button onClick={open(NEW_BOT_URL)} className={PRIMARY}>
              Create a bot in Telegram
            </button>
            <TelegramTokenPaste onToken={link.connect} busy={busy} />
          </>
        )}
      </Step>
      <Step n={2} title="Open it and tap Start" done={connected} current={waiting}>
        {connected ? (
          <p className="text-[12.5px] text-[var(--text-muted)]">
            Connected to {status?.chats[0]?.name}. It just got a welcome message from {bot}.
          </p>
        ) : waiting && problem ? (
          <div role="alert" className="space-y-2">
            <p className="text-[12.5px] leading-5 text-[var(--accent-red-text)]">{problem.text}</p>
            <p className="break-words text-[11.5px] leading-5 text-[var(--text-muted)]">{problem.said}</p>
            <button onClick={link.disconnect} disabled={busy} className={BTN_SECONDARY}>
              Use a new bot
            </button>
          </div>
        ) : waiting && status?.bot && status.code ? (
          <div className="flex items-center gap-3">
            <button onClick={open(startUrl(status.bot, status.code))} className={PRIMARY}>
              Open {bot}
            </button>
            <span className="text-[12.5px] text-[var(--text-muted)]">Waiting for you to tap Start…</span>
          </div>
        ) : null}
      </Step>
    </ol>
  );
}
