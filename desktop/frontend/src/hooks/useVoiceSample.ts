import { useCallback, useEffect, useRef, useState } from "react";
import { VideoVoiceSample } from "../../bridge/commands";
import { toast } from "../notifications/toast";

export interface VoiceSampleState {
  // As EXPLAINCAST_VOICE spells it: "local/af_heart", "openai/marin".
  voice: string;
  phase: "loading" | "playing";
}

// Plays explaincast's few-second sample of a narrator's voice. One at a time:
// a new one, or leaving the window, stops the last.
export function useVoiceSample(): {
  sample: VoiceSampleState | null;
  play: (voice: string) => void;
  stop: () => void;
} {
  const [sample, setSample] = useState<VoiceSampleState | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const turn = useRef(0);

  const stop = useCallback(() => {
    turn.current++;
    audio.current?.pause();
    audio.current = null;
    setSample(null);
  }, []);

  useEffect(() => stop, [stop]);

  const play = useCallback(
    (voice: string) => {
      stop();
      const mine = turn.current;
      setSample({ voice, phase: "loading" });
      VideoVoiceSample(voice)
        .then((clip: string) => {
          if (turn.current !== mine) return;
          // The demo has no voices to play.
          if (!clip) return stop();
          const el = new Audio(`data:audio/wav;base64,${clip}`);
          audio.current = el;
          el.onended = () => {
            if (audio.current === el) stop();
          };
          setSample({ voice, phase: "playing" });
          return el.play();
        })
        .catch((err: unknown) => {
          if (turn.current !== mine) return;
          stop();
          toast.error("Couldn't play the voice", { description: String(err) });
        });
    },
    [stop],
  );

  return { sample, play, stop };
}
