import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_READY, type ReadyDraft } from "../../serviceReady";
import { ReadyPicker } from "./ReadyPicker";

const markup = (value: ReadyDraft, servicePort = 4000, dependents: string[] = []) =>
  renderToStaticMarkup(
    <ReadyPicker value={value} onChange={() => {}} servicePort={servicePort} dependents={dependents} />,
  );

describe("ReadyPicker", () => {
  it("names what waits for the service", () => {
    const port: ReadyDraft = { kind: "port", value: "", timeout: "" };
    expect(markup(port, 4000, ["web", "worker"])).toContain("web and worker wait for this.");
    expect(markup(port, 4000, ["web"])).toContain("web waits for this.");
    expect(markup(EMPTY_READY)).toContain("Counts as ready as soon as it starts.");
  });

  it("shows no fields without a check, and the service's port as the default", () => {
    expect(markup(EMPTY_READY)).not.toContain("Timeout in seconds");
    expect(markup({ kind: "port", value: "", timeout: "" })).toContain('placeholder="4000 (this service&#x27;s port)"');
  });

  it("says why a check can't be saved", () => {
    expect(markup({ kind: "port", value: "", timeout: "" }, 0)).toContain("Set the service&#x27;s port");
    expect(markup({ kind: "url", value: "localhost", timeout: "" })).toContain("http://");
  });
});
