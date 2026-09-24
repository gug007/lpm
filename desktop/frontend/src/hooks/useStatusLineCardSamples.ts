import { useEffect, useState } from "react";
import { PreviewClaudeStatusline } from "../../bridge/commands";
import type {
  StatusLineSamples,
  StatusLineTemplateId,
} from "../components/StatusLinePresetPicker";
import type { CustomSpec } from "../components/statusLineTypes";

export function useStatusLineCardSamples({
  enabled,
  hasCustom,
  selected,
  savedCustomSpec,
  livePreview,
}: {
  enabled: boolean;
  hasCustom: boolean;
  selected: StatusLineTemplateId;
  savedCustomSpec: CustomSpec | null;
  livePreview: string | null;
}): StatusLineSamples {
  const [samples, setSamples] = useState<StatusLineSamples>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const requests: [StatusLineTemplateId, Record<string, unknown>][] = [
      ["meters", { kind: "template", id: "meters" }],
      ["minimal", { kind: "template", id: "minimal" }],
      ["vibrant", { kind: "template", id: "vibrant" }],
    ];
    if (hasCustom) requests.push(["current", { kind: "current" }]);
    void Promise.allSettled(
      requests.map(([id, selection]) =>
        PreviewClaudeStatusline(selection).then(
          (output: unknown) => [id, output] as const,
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: StatusLineSamples = {};
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const [id, output] = result.value;
        if (typeof output === "string") next[id] = output;
      }
      setSamples((current) => ({ ...current, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, hasCustom]);

  useEffect(() => {
    if (!enabled || selected === "custom" || !savedCustomSpec) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      PreviewClaudeStatusline({ kind: "custom", spec: savedCustomSpec })
        .then((output: unknown) => {
          if (!cancelled && typeof output === "string") {
            setSamples((current) => ({ ...current, custom: output }));
          }
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [enabled, selected, savedCustomSpec]);

  useEffect(() => {
    if (!livePreview || selected === "ai") return;
    setSamples((current) =>
      current[selected] === livePreview
        ? current
        : { ...current, [selected]: livePreview },
    );
  }, [livePreview, selected]);

  return samples;
}
