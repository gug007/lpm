import { useState } from "react";
import { SetupStep } from "./SetupStep";
import { AppleIcon } from "./AppleIcon";
import { PRIMARY_BUTTON, QUIET_BUTTON, SECONDARY_BUTTON } from "./styles";
import { BrowserOpenURL } from "../../../bridge/runtime";
import { APP_STORE_URL } from "../../mobile/links";
import { MACHINE } from "../../machineWords";

/** First run, as three steps: get the app, set up Tailscale so the pairing code
 *  works from anywhere, then pair. Skipping Tailscale stays one click, and the
 *  card says what that means. */
export function NoPhoneCard({
  awayReady,
  busy,
  settingUpAway,
  onPair,
  onSetUpAway,
}: {
  awayReady: boolean;
  busy: boolean;
  settingUpAway: boolean;
  onPair: () => void;
  onSetUpAway: () => void;
}) {
  const [skipped, setSkipped] = useState(false);
  const ready = awayReady || skipped;

  return (
    <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
      <SetupStep n={1} done={false} title="Get lpm Link" detail="On your iPhone or iPad, from the App Store.">
        <button onClick={() => BrowserOpenURL(APP_STORE_URL)} className={SECONDARY_BUTTON}>
          <span className="flex items-center gap-1.5">
            <AppleIcon size={12} /> App Store
          </span>
        </button>
      </SetupStep>
      <SetupStep
        n={2}
        done={awayReady}
        title="Set up Tailscale"
        detail={
          awayReady
            ? "Done · the pairing code will work from anywhere."
            : skipped
              ? `Skipped · your device will connect only on ${MACHINE.thisMachine}'s network.`
              : `So your device reaches ${MACHINE.thisMachine} from anywhere, not just this network.`
        }
      >
        {!awayReady && !skipped && (
          <>
            <button onClick={() => setSkipped(true)} className={QUIET_BUTTON}>
              Skip
            </button>
            <button onClick={onSetUpAway} disabled={settingUpAway} className={PRIMARY_BUTTON}>
              {settingUpAway ? "Opening…" : "Set up"}
            </button>
          </>
        )}
      </SetupStep>
      <SetupStep n={3} done={false} title="Pair a device" detail="Scan the code with lpm Link, or approve it here.">
        <button onClick={onPair} disabled={busy} className={ready ? PRIMARY_BUTTON : SECONDARY_BUTTON}>
          {busy ? "Preparing…" : "Pair a device"}
        </button>
      </SetupStep>
    </div>
  );
}
