import { toast as sonnerToast, type ExternalToast } from "sonner";
import { ToastCopyButton } from "./components/ToastCopyButton";

type Message = Parameters<typeof sonnerToast.error>[0];

function error(message: Message, data?: ExternalToast) {
  if (typeof message !== "string" || data?.action != null) {
    return sonnerToast.error(message, data);
  }
  const description = typeof data?.description === "string" ? data.description : undefined;
  const copyText = description ? `${message}\n${description}` : message;
  const origDescription =
    typeof data?.description === "function" ? data.description() : data?.description;
  return sonnerToast.error(message, {
    ...data,
    description: (
      <>
        {origDescription != null ? <div>{origDescription}</div> : null}
        <ToastCopyButton text={copyText} />
      </>
    ),
  });
}

export const toast = Object.assign(
  (message: Parameters<typeof sonnerToast>[0], data?: ExternalToast) => sonnerToast(message, data),
  sonnerToast,
  { error },
) as typeof sonnerToast;
