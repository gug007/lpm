// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentDialog } from "../agentDialog";

const screen = vi.hoisted(() => ({
  dialog: null as AgentDialog | null,
  answer: vi.fn<(id: string, shown: AgentDialog, option: { key: string }) => Promise<"sent" | "changed">>(),
  toast: vi.fn(),
}));

vi.mock("../agentDialogScreen", () => ({
  useAgentDialog: () => screen.dialog,
  answerAgentDialog: screen.answer,
}));
vi.mock("../notifications/toast", () => ({ toast: Object.assign(screen.toast, { error: vi.fn() }) }));

import { SidebarAgentAsk } from "./SidebarAgentAsk";

const BASH: AgentDialog = {
  question: "Do you want to proceed?",
  details: ["Bash command", "make train EPOCHS=3"],
  options: [
    { key: "1", label: "Yes", description: "", selected: true, typed: false },
    { key: "2", label: "Yes, and don't ask again for: make train *", description: "", selected: false, typed: false },
    { key: "3", label: "No", description: "", selected: false, typed: false },
  ],
};

let container: HTMLDivElement;
let root: Root;
let onOpen: ReturnType<typeof vi.fn<() => void>>;

function render() {
  act(() => root.render(<SidebarAgentAsk terminalId="%7" lead="pl-2.5" onOpen={onOpen} />));
}

const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onOpen = vi.fn<() => void>();
  screen.dialog = BASH;
  screen.answer.mockReset();
  screen.answer.mockResolvedValue("sent");
  screen.toast.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("SidebarAgentAsk", () => {
  it("shows the question, what it is about and the agent's own choices", () => {
    render();
    expect(container.textContent).toContain("Do you want to proceed?");
    expect(container.textContent).toContain("make train EPOCHS=3");
    expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "1Yes",
      "2Yes, and don't ask again for: make train *",
      "3No",
    ]);
  });

  it("shows nothing when the screen holds no dialog", () => {
    screen.dialog = null;
    render();
    expect(container.textContent).toBe("");
  });

  it("answers with the picked option's number", async () => {
    render();
    await act(async () => buttonByText("No")!.click());
    expect(screen.answer).toHaveBeenCalledWith("%7", BASH, BASH.options[2]);
    expect(buttonByText("Yes")!.disabled).toBe(true);
  });

  it("warns instead of answering when the question changed under the click", async () => {
    screen.answer.mockResolvedValue("changed");
    render();
    await act(async () => buttonByText("Yes")!.click());
    expect(screen.toast).toHaveBeenCalledWith("The question changed. Check it again before answering.");
    expect(buttonByText("Yes")!.disabled).toBe(false);
  });

  it("points to the terminal when an answer leaves the dialog where it was", async () => {
    render();
    await act(async () => buttonByText("Yes")!.click());
    expect(container.textContent).not.toContain("didn't reach");
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(container.textContent).toContain("That didn't reach the agent.");
    act(() => buttonByText("Answer in the terminal")!.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the terminal after picking a choice that needs typing", async () => {
    screen.dialog = {
      question: "Which color do you prefer?",
      details: [],
      options: [
        { key: "1", label: "Red", description: "Choose red", selected: true, typed: false },
        { key: "2", label: "Type something.", description: "", selected: false, typed: true },
      ],
    };
    render();
    await act(async () => buttonByText("Type something.")!.click());
    expect(screen.answer.mock.calls[0][2].key).toBe("2");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
