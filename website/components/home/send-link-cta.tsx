import { SendLinkButton } from "./send-link-button";

export function SendLinkCta() {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <SendLinkButton variant="primary" label="Send lpm to my computer" />
      <p className="text-pretty text-center text-[13px] text-gray-500 dark:text-gray-400">
        AirDrop it to your Mac, or message the link to yourself.
      </p>
    </div>
  );
}
