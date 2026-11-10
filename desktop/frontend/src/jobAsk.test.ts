import { describe, expect, it } from "vitest";
import {
  answersOnClick,
  askDeadlineNote,
  askParts,
  askStatusLabel,
  askWaitingIn,
  displayAnswer,
  draftAnswers,
  EMPTY_ASK_DRAFT,
  holdsJob,
  togglePick,
  waitingAsks,
  type JobAsk,
  type JobAskQuestion,
} from "./jobAsk";

const confirm: JobAskQuestion = { id: "q1", type: "confirm", text: "Deploy?", yes: "Ship" };
const choice: JobAskQuestion = {
  id: "q2",
  type: "choice",
  text: "Region?",
  options: [{ label: "us" }, { label: "eu" }],
  other: true,
};
const notes: JobAskQuestion = { id: "q3", type: "text", text: "Notes?", optional: true };

function ask(over: Partial<JobAsk> = {}): JobAsk {
  return { id: "a", askedAt: 0, questions: [confirm], status: "open", ...over };
}

describe("jobAsk", () => {
  it("collects the answers and names the first question still open", () => {
    const drafts = {
      q1: { ...EMPTY_ASK_DRAFT, picks: ["no"] },
      q2: { ...EMPTY_ASK_DRAFT, other: "  ap-south " },
    };
    expect(draftAnswers([confirm, choice, notes], drafts)).toEqual({
      answers: { q1: false, q2: ["ap-south"] },
      missing: null,
    });
    expect(draftAnswers([confirm, choice], {}).missing?.id).toBe("q1");
  });

  it("picks one option at a time unless the question takes several", () => {
    const one = togglePick(choice, { ...EMPTY_ASK_DRAFT, other: "x" }, "us");
    expect(togglePick(choice, one, "eu")).toEqual({ ...EMPTY_ASK_DRAFT, picks: ["eu"] });
    const many = { ...choice, multiple: true };
    expect(togglePick(many, togglePick(many, EMPTY_ASK_DRAFT, "us"), "eu").picks).toEqual([
      "us",
      "eu",
    ]);
    expect(togglePick(many, { ...EMPTY_ASK_DRAFT, picks: ["us"] }, "us").picks).toEqual([]);
  });

  it("reads answers by their labels", () => {
    expect(displayAnswer(confirm, true)).toBe("Ship");
    expect(displayAnswer(confirm, false)).toBe("No");
    expect(displayAnswer(choice, ["us", "eu"])).toBe("us, eu");
    expect(displayAnswer(notes, "later")).toBe("later");
  });

  it("answers a single yes/no or pick-one on click and everything else on send", () => {
    expect(answersOnClick(ask())).toBe(true);
    expect(answersOnClick(ask({ questions: [choice] }))).toBe(true);
    expect(answersOnClick(ask({ questions: [{ ...choice, multiple: true }] }))).toBe(false);
    expect(answersOnClick(ask({ questions: [confirm, notes] }))).toBe(false);
    expect(answersOnClick(ask({ questions: [notes] }))).toBe(false);
  });

  it("says how a question ended", () => {
    expect(askStatusLabel(ask())).toBe("Waiting for your answer");
    expect(askStatusLabel(ask({ status: "answered" }))).toBe("Answered");
    expect(askStatusLabel(ask({ status: "answered", reply: "later" }))).toBe("Answered in a reply");
    expect(askStatusLabel(ask({ status: "answered", auto: true }))).toContain("default");
    expect(askStatusLabel(ask({ status: "dismissed" }))).toBe("Skipped");
    expect(askStatusLabel(ask({ status: "replaced" }))).toBe("Replaced by a newer question");
    expect(askStatusLabel(ask({ status: "unanswered" }))).toBe("No answer");
  });

  it("says what happens when nobody answers in time", () => {
    const now = 1_000_000;
    expect(askDeadlineNote(ask({ expiresAt: 1000 + 3 * 3600 }), now)).toBe(
      "If nobody answers in 3h, the question closes",
    );
    const covered = ask({ questions: [{ ...confirm, default: false }], expiresAt: 1000 + 20 * 60 });
    expect(askDeadlineNote(covered, now)).toBe("If nobody answers in 20m, it goes with No");
    const several = ask({ questions: [{ ...confirm, default: true }, notes], expiresAt: 1000 + 90 });
    expect(askDeadlineNote(several, now)).toBe("If nobody answers in 2m, it goes on with the defaults");
    const skippable = ask({ questions: [notes], expiresAt: 1000 + 3600 });
    expect(askDeadlineNote(skippable, now)).toBe("If nobody answers in 1h, it goes on without an answer");
    expect(askDeadlineNote(ask(), now)).toBe("");
  });

  it("finds the question waiting in a project", () => {
    expect(askWaitingIn(ask({ project: "web" }), "web")?.id).toBe("a");
    expect(askWaitingIn(ask({ project: "api" }), "web")).toBeUndefined();
    expect(askWaitingIn(ask({ status: "answered" }), "web")).toBeUndefined();
  });
});

describe("waitingAsks", () => {
  it("lists every open question a row carries, or its one ask from an older host", () => {
    const held = ask({ id: "h" });
    const keyed = ask({ id: "k", key: "tg:1" });
    const closed = ask({ id: "c", key: "tg:2", status: "replaced" });
    expect(waitingAsks({ ask: held, asks: [held, keyed, closed] }).map((a) => a.id)).toEqual(["h", "k"]);
    expect(waitingAsks({ ask: held }).map((a) => a.id)).toEqual(["h"]);
    expect(waitingAsks({ ask: { ...held, status: "answered" } })).toEqual([]);
    expect(waitingAsks({})).toEqual([]);
  });

  it("only a question without a key holds the job up", () => {
    expect(holdsJob(ask())).toBe(true);
    expect(holdsJob(ask({ key: "tg:1" }))).toBe(false);
  });
});

describe("askParts", () => {
  it("leads with the first line and keeps the rest as it was written", () => {
    expect(askParts("Ship it?\n\nline one\n  line two\n")).toEqual({
      headline: "Ship it?",
      details: "line one\n  line two",
    });
  });

  it("leaves a one-line question whole", () => {
    expect(askParts("Ship it?")).toEqual({ headline: "Ship it?", details: "" });
  });
});
