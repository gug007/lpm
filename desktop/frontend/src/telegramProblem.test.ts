import { describe, expect, it } from "vitest";
import { telegramProblem } from "./telegramProblem";

describe("telegramProblem", () => {
  it("names the reader Telegram gives the bot's messages to", () => {
    expect(
      telegramProblem("Telegram said: Conflict: can't use getUpdates method while webhook is active"),
    ).toMatch(/^Another app gets this bot's messages/);
    expect(
      telegramProblem("Telegram said: Conflict: terminated by other getUpdates request"),
    ).toMatch(/^Another app or computer is reading this bot's messages/);
  });

  it("asks for a new bot when the token stopped working", () => {
    expect(telegramProblem("Telegram said: Unauthorized")).toBe(
      "Telegram no longer accepts this bot's token. Use a new bot.",
    );
    expect(telegramProblem("Telegram said: Not Found")).toBe(
      "Telegram no longer accepts this bot's token. Use a new bot.",
    );
  });

  it("keeps waiting through anything else, saying so", () => {
    expect(telegramProblem("Couldn't reach Telegram: connection refused")).toBe(
      "lpm can't read this bot's messages yet. It keeps trying.",
    );
  });
});
