import { useState } from "react";
import { SettingsRow } from "./SettingsRow";
import { TelegramChatList } from "./TelegramChatList";
import { SendToConnectModal } from "./project-detail/jobs/SendToConnectModal";
import { BTN_SECONDARY } from "./ui/buttons";
import { ConfirmLabel } from "./ui/ConfirmLabel";
import { rowProps } from "../settings-registry";
import { useConfirmFlashFor } from "../hooks/useConfirmFlash";
import { useTelegramLink } from "../hooks/useTelegramLink";
import type { ConnectIntent } from "../sendToConnectors";

const CHAT_BTN =
  "rounded-md px-2 py-1 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

// Telegram as a place automations on a machine (`host`, null for this one) send
// their results. Connecting happens in the same dialog the job editor uses; once
// linked, the row lists the chats jobs can pick from, with a test and a remove
// for each.
export function TelegramRow({ host }: { host: string | null }) {
  const link = useTelegramLink({ host });
  const { status, waiting, busy, bot } = link;
  const [dialog, setDialog] = useState<ConnectIntent | null>(null);
  const [testedKey, flashTested] = useConfirmFlashFor<string>();

  const sendTest = async (key: string) => {
    if (await link.test(key)) flashTested(key);
  };

  const description =
    status === undefined
      ? "Checking…"
      : status.connected
        ? `Posts through ${bot}. Each automation picks which of these chats it sends to.`
        : waiting
          ? (link.problem?.text ?? `Almost there: open ${bot} in Telegram and tap Start`)
          : "Send automation results to a Telegram chat, group or channel";

  return (
    <>
      <SettingsRow
        {...rowProps("notifications.telegram", { description })}
        footer={
          status?.connected && (
            <div className="mt-3">
              <TelegramChatList
                chats={status.chats}
                actions={(chat) => (
                  <>
                    <button onClick={() => sendTest(chat.key)} disabled={busy} className={CHAT_BTN}>
                      <ConfirmLabel
                        confirmed={testedKey === chat.key}
                        label="Send test"
                        done="Sent"
                      />
                    </button>
                    <button onClick={() => link.removeChat(chat.key)} disabled={busy} className={CHAT_BTN}>
                      Remove
                    </button>
                  </>
                )}
              />
            </div>
          )
        }
      >
        {status === undefined ? null : status.connected ? (
          <div className="flex items-center gap-2">
            <button onClick={() => setDialog("add")} disabled={busy} className={BTN_SECONDARY}>
              Add chat
            </button>
            <button onClick={link.disconnect} disabled={busy} className={BTN_SECONDARY}>
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={() => setDialog("connect")} className={BTN_SECONDARY}>
            {waiting ? "Finish connecting" : "Connect"}
          </button>
        )}
      </SettingsRow>
      <SendToConnectModal
        destination={dialog ? "telegram" : null}
        host={host}
        intent={dialog ?? "connect"}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
