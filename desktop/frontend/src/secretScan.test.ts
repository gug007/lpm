import { describe, expect, it } from "vitest";
import { findingKey, findingPlace, openFindings, type SecretFinding } from "./secretScan";

const stripe: SecretFinding = { path: "src/lib/stripe.ts", line: 12, rule: "Stripe secret key", masked: "sk_live_••••Qx" };
const env: SecretFinding = { path: ".env", line: 0, rule: "Environment file", masked: "" };

describe("openFindings", () => {
  it("drops findings in files left out and lines ignored", () => {
    const all = [stripe, env];
    expect(openFindings(all, new Set([stripe.path, env.path]), new Set())).toEqual(all);
    expect(openFindings(all, new Set([stripe.path]), new Set())).toEqual([stripe]);
    expect(openFindings(all, new Set([stripe.path, env.path]), new Set([findingKey(stripe)]))).toEqual([env]);
  });

  it("keeps a second key on the same line that wasn't ignored", () => {
    const aws = { ...stripe, rule: "AWS access key ID", masked: "AKIA••••XY" };
    expect(openFindings([stripe, aws], new Set([stripe.path]), new Set([findingKey(stripe)]))).toEqual([aws]);
  });
});

describe("findingPlace", () => {
  it("names the line, or the file for a whole-file finding", () => {
    expect(findingPlace(stripe)).toBe("src/lib/stripe.ts:12");
    expect(findingPlace(env)).toBe(".env");
  });
});
