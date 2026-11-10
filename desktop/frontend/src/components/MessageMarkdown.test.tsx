// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageMarkdown } from "./MessageMarkdown";

vi.mock("../../bridge/runtime", () => ({ BrowserOpenURL: vi.fn() }));
vi.mock("../highlight", () => ({
  ensureLang: vi.fn(async () => false),
  tokenizeLines: vi.fn(async () => []),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const draft =
  "Load balancing across both servers has been on since Nov 7. If a name has several addresses, visitors are spread across all of them.";

const show = (text: string) => act(async () => root.render(<MessageMarkdown text={text} />));
const pre = () => host.querySelector("pre")!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("MessageMarkdown", () => {
  it("wraps a block of plain text, such as a drafted reply, instead of scrolling it sideways", async () => {
    await show(`Draft reply to the customer:\n\n\`\`\`\n${draft}\n\`\`\``);
    expect(pre().className).toContain("whitespace-pre-wrap");
    expect(pre().className).not.toContain("overflow-x-auto");
    expect(pre().textContent).toBe(draft);
  });

  it("keeps code on its own lines, scrolling sideways", async () => {
    await show("```ts\nconst servers = [\"10.0.0.12\", \"10.0.0.31\"];\n```");
    expect(pre().className).toContain("overflow-x-auto");
    expect(pre().className).not.toContain("whitespace-pre-wrap");
  });
});
