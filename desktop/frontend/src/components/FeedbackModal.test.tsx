// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock("../../bridge/commands", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GetVersion: () => Promise.resolve("0.7.32"),
  GetPlatform: () => Promise.resolve("darwin/arm64"),
}));
vi.mock("../../bridge/runtime", () => ({
  BrowserOpenURL: bridge.open,
  EventsOn: () => () => {},
  EventsEmit: vi.fn(),
}));

import { FeedbackModal } from "./FeedbackModal";
import { useAppStore } from "../store/app";
import { LESSONS, MAKER_LINKEDIN_URL, MAKER_X_URL, lessonDate, lessonUrl } from "../lessons";
import { TUTORIAL_PLAYLIST_URL } from "../sidebarNav";

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  bridge.open.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  useAppStore.setState({ feedbackOpen: true });
  await act(async () => root.render(<FeedbackModal />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  useAppStore.setState({ feedbackOpen: false });
});

const box = () => document.querySelector<HTMLTextAreaElement>("#feedback-text")!;
const chip = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(
    (b) => b.textContent === name,
  )!;
const pressed = () =>
  [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed='true']")].map(
    (b) => b.textContent,
  );
const submit = () => document.querySelector<HTMLButtonElement>("button[type='submit']")!;

function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => {
    setter.call(box(), value);
    box().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("FeedbackModal", () => {
  it("opens on one empty box with nothing guessed", () => {
    expect(box()).not.toBeNull();
    expect(pressed()).toEqual([]);
    expect(submit().disabled).toBe(true);
  });

  it("guesses the type from the text and shows the title", () => {
    type("The terminal crashes when I paste a long line. It happens every time.");
    expect(pressed()).toEqual(["Bug"]);
    expect(document.body.textContent).toContain("Title: The terminal crashes when I paste a long line");
    expect(submit().disabled).toBe(false);

    type("How do I run two agents on one project?");
    expect(pressed()).toEqual(["Question"]);
  });

  it("keeps the type the user picked as the text changes", () => {
    type("The terminal crashes when I paste a long line");
    act(() => chip("Idea").click());
    type("The terminal crashes when I paste a long line. Could it warn first?");
    expect(pressed()).toEqual(["Idea"]);
  });

  it("starts an idea discussion with the title and full text on ⌘Enter", () => {
    type("Pin a project to the top. I switch between twelve projects.");
    act(() => {
      box().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    });
    expect(bridge.open).toHaveBeenCalledTimes(1);
    const url = new URL(bridge.open.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/gug007/lpm/discussions/new");
    expect(url.searchParams.get("category")).toBe("ideas");
    expect(url.searchParams.get("title")).toBe("Pin a project to the top");
    expect(url.searchParams.get("body")).toBe(
      "Pin a project to the top. I switch between twelve projects.\n\n---\nlpm 0.7.32 · darwin/arm64",
    );
    expect(useAppStore.getState().feedbackOpen).toBe(false);
  });

  it("says where each type goes before it is sent", () => {
    const footer = () => submit().parentElement!.textContent;
    expect(footer()).toContain("Bugs open a GitHub issue; ideas and questions start a GitHub discussion");
    expect(submit().textContent).toBe("Open on GitHub");

    type("The terminal crashes when I paste a long line");
    expect(footer()).toContain("Bugs open a GitHub issue");
    expect(submit().textContent).toBe("Open GitHub issue");

    act(() => chip("Idea").click());
    expect(footer()).toContain("Ideas start a GitHub discussion");
    expect(submit().textContent).toBe("Start GitHub discussion");

    act(() => chip("Question").click());
    expect(footer()).toContain("Questions start a Q&A discussion");
    expect(submit().textContent).toBe("Start GitHub discussion");
  });

  it("files a bug as a labelled issue and a question in Q&A", () => {
    type("The terminal crashes when I paste a long line");
    act(() => submit().click());
    const issue = new URL(bridge.open.mock.calls[0][0] as string);
    expect(issue.pathname).toBe("/gug007/lpm/issues/new");
    expect(issue.searchParams.get("labels")).toBe("bug");

    act(() => useAppStore.setState({ feedbackOpen: true }));
    type("How do I run two agents on one project?");
    act(() => submit().click());
    const question = new URL(bridge.open.mock.calls[1][0] as string);
    expect(question.pathname).toBe("/gug007/lpm/discussions/new");
    expect(question.searchParams.get("category")).toBe("q-a");
  });

  it("lists every lesson and opens one on YouTube", () => {
    const rail = document.querySelector("aside[aria-label='Lessons and news']")!;
    const lessons = [...rail.querySelectorAll("li button")];
    expect(lessons.map((b) => b.textContent)).toEqual(
      LESSONS.map((l) => `${l.title}${lessonDate(l.published)}`),
    );

    act(() => (lessons[0] as HTMLButtonElement).click());
    expect(bridge.open).toHaveBeenCalledWith(lessonUrl(LESSONS[0].id));
    expect(useAppStore.getState().feedbackOpen).toBe(true);
  });

  it("opens the playlist and the maker's X and LinkedIn", () => {
    const button = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>("aside button")].find(
        (b) => b.textContent === name || b.getAttribute("aria-label") === name,
      )!;
    act(() => button("All lessons on YouTube").click());
    act(() => button("lpm's maker on X").click());
    act(() => button("lpm's maker on LinkedIn").click());
    expect(bridge.open.mock.calls.map((call) => call[0])).toEqual([
      TUTORIAL_PLAYLIST_URL,
      MAKER_X_URL,
      MAKER_LINKEDIN_URL,
    ]);
  });
});

describe("lessonDate", () => {
  it("shows the calendar day it was published", () => {
    expect(lessonDate("2026-10-21")).toBe("Oct 21");
    expect(lessonDate("2026-01-01")).toBe("Jan 1");
  });
});
