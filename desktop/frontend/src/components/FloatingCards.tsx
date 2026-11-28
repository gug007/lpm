import { GenerateApproval } from "./GenerateApproval";
import { TalkHost } from "./talk/TalkHost";

// What floats over the app waiting for an answer, stacked so one card never
// covers another and what is behind them stays readable.
export function FloatingCards() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-12 z-40 flex flex-col items-center gap-2 px-4">
      <GenerateApproval />
      <TalkHost />
    </div>
  );
}
