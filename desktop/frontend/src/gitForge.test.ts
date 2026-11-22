import { describe, expect, it } from "vitest";
import { cliLoginCommand, forgeWords, prWords } from "./gitForge";

describe("forgeWords", () => {
  it("keeps GitHub's words for anything that isn't GitLab", () => {
    for (const kind of [undefined, null, "github", "bitbucket"]) {
      const words = forgeWords(kind);
      expect(words.short).toBe("PR");
      expect(words.ref(42)).toBe("#42");
      expect(words.site).toBe("GitHub");
    }
  });

  it("says merge request and !N on GitLab", () => {
    const words = prWords({ host: "gitlab" });
    expect(words.short).toBe("MR");
    expect(words.ref(128)).toBe("!128");
    expect(words.title).toBe("Merge Request");
    expect(words.checksPath).toBe("pipelines");
  });
});

describe("cliLoginCommand", () => {
  it("names a self-hosted GitLab's host", () => {
    expect(cliLoginCommand(null)).toBe("gh auth login");
    expect(cliLoginCommand({ kind: "gitlab", host: "gitlab.com", cliFound: false })).toBe(
      "glab auth login",
    );
    expect(cliLoginCommand({ kind: "gitlab", host: "gitlab.acme.dev", cliFound: false })).toBe(
      "glab auth login --hostname gitlab.acme.dev",
    );
  });
});
