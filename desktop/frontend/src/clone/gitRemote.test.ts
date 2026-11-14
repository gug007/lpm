import { describe, expect, it } from "vitest";
import { parseGitRemote, remoteHost, repoNameFromUrl } from "./gitRemote";

describe("parseGitRemote", () => {
  it.each([
    ["https://github.com/acme/storefront", "https://github.com/acme/storefront", "github.com/acme/storefront"],
    ["https://github.com/acme/storefront.git", "https://github.com/acme/storefront.git", "github.com/acme/storefront"],
    ["  https://github.com/acme/storefront/\n", "https://github.com/acme/storefront", "github.com/acme/storefront"],
    [
      "https://github.com/acme/storefront?tab=readme-ov-file#install",
      "https://github.com/acme/storefront",
      "github.com/acme/storefront",
    ],
    ["git@github.com:acme/storefront.git", "git@github.com:acme/storefront.git", "github.com/acme/storefront"],
    ["git@gitlab.com:group/sub/app", "git@gitlab.com:group/sub/app", "gitlab.com/group/sub/app"],
    ["git@work-gh:acme/storefront.git", "git@work-gh:acme/storefront.git", "work-gh/acme/storefront"],
    ["ssh://git@example.com:2222/team/app.git", "ssh://git@example.com:2222/team/app.git", "example.com/team/app"],
    ["ssh://git@example.com/team/app", "ssh://git@example.com/team/app", "example.com/team/app"],
    ["git://example.org/tools/thing.git", "git://example.org/tools/thing.git", "example.org/tools/thing"],
    ["https://gitlab.com/group/sub/app", "https://gitlab.com/group/sub/app", "gitlab.com/group/sub/app"],
    ["https://git.example.com/team/app.git", "https://git.example.com/team/app.git", "git.example.com/team/app"],
    [
      "https://dev.azure.com/org/project/_git/repo",
      "https://dev.azure.com/org/project/_git/repo",
      "dev.azure.com/org/project/_git/repo",
    ],
  ])("reads %s", (text, url, label) => {
    expect(parseGitRemote(text)).toEqual({ url, label });
  });

  it.each([
    "",
    "storefront",
    "hello world",
    "https://example.com/blog/post",
    "https://github.com/acme",
    "https://github.com/acme/storefront/pull/12",
    "https://github.com/settings/profile",
    "https://gitlab.com/group/app/-/issues",
    "https://user:token@github.com/acme/storefront.git",
    "https://github.com/acme/storefront.git; rm -rf /",
    "git@github.com:acme",
    "someone@example.com",
    "note:acme/storefront",
    "ftp://example.com/acme/storefront.git",
    "https://github.com/acme/storefront\nhttps://github.com/acme/other",
  ])("ignores %j", (text) => {
    expect(parseGitRemote(text)).toBeNull();
  });
});

describe("repoNameFromUrl", () => {
  it.each([
    ["https://github.com/acme/storefront.git", "storefront"],
    ["https://github.com/acme/Store Front/", "store-front"],
    ["git@github.com:acme/storefront.git", "storefront"],
    ["git@host:storefront.git", "storefront"],
    ["https://github.com/acme/storefront?tab=readme", "storefront"],
    ["", ""],
  ])("%s → %s", (url, name) => {
    expect(repoNameFromUrl(url)).toBe(name);
  });
});

describe("remoteHost", () => {
  it.each([
    ["https://github.com/acme/storefront.git", "github.com"],
    ["https://user@GitHub.com/acme/storefront", "github.com"],
    ["ssh://git@example.com:2222/team/app.git", "example.com"],
    ["git@gitlab.com:group/app.git", "gitlab.com"],
    ["/local/path", ""],
    ["", ""],
  ])("%s → %j", (url, host) => {
    expect(remoteHost(url)).toBe(host);
  });
});
