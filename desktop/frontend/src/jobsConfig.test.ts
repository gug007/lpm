import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  deleteJobFromDoc,
  jobIdsInDoc,
  readJobPayloadFromDoc,
  setJobInDoc,
} from "./jobsConfig";

const doc = (yaml: string) => YAML.parseDocument(yaml || "{}");

describe("setJobInDoc", () => {
  it("creates the jobs section and writes an entry", () => {
    const d = doc("");
    setJobInDoc(d, "nightly", {
      label: "Nightly",
      schedule: { every: "6h" },
      run: { cmd: "make" },
    });
    const parsed = YAML.parse(String(d));
    expect(parsed).toEqual({
      jobs: {
        nightly: {
          label: "Nightly",
          schedule: { every: "6h" },
          run: { cmd: "make" },
        },
      },
    });
  });

  it("preserves other sections and other jobs", () => {
    const d = doc(
      "actions:\n  dev: npm run dev\njobs:\n  a:\n    label: A\n    schedule:\n      every: 6h\n    run:\n      cmd: a\n",
    );
    setJobInDoc(d, "b", {
      label: "B",
      schedule: { at: "09:00" },
      run: { prompt: "go" },
    });
    const parsed = YAML.parse(String(d));
    expect(parsed.actions).toEqual({ dev: "npm run dev" });
    expect(Object.keys(parsed.jobs)).toEqual(["a", "b"]);
    expect(parsed.jobs.b).toEqual({
      label: "B",
      schedule: { at: "09:00" },
      run: { prompt: "go" },
    });
  });

  it("overwrites an existing job with the same id", () => {
    const d = doc(
      "jobs:\n  a:\n    label: Old\n    schedule:\n      every: 6h\n    run:\n      cmd: old\n",
    );
    setJobInDoc(d, "a", {
      label: "New",
      schedule: { every: "12h" },
      run: { cmd: "new" },
    });
    const parsed = YAML.parse(String(d));
    expect(parsed.jobs.a).toEqual({
      label: "New",
      schedule: { every: "12h" },
      run: { cmd: "new" },
    });
  });
});

describe("readJobPayloadFromDoc", () => {
  it("returns a job's mapping, or null when absent", () => {
    const d = doc(
      "jobs:\n  a:\n    label: A\n    schedule:\n      at: '09:00'\n      days: [mon, thu]\n    run:\n      prompt: hi\n",
    );
    expect(readJobPayloadFromDoc(d, "a")).toEqual({
      label: "A",
      schedule: { at: "09:00", days: ["mon", "thu"] },
      run: { prompt: "hi" },
    });
    expect(readJobPayloadFromDoc(d, "missing")).toBeNull();
    expect(readJobPayloadFromDoc(doc(""), "a")).toBeNull();
  });
});

describe("deleteJobFromDoc", () => {
  it("removes a job and drops the empty section", () => {
    const d = doc(
      "jobs:\n  a:\n    label: A\n    schedule:\n      every: 6h\n    run:\n      cmd: a\n",
    );
    expect(deleteJobFromDoc(d, "a")).toBe(true);
    expect(YAML.parse(String(d))).toEqual({});
  });

  it("keeps other jobs and reports a miss", () => {
    const d = doc(
      "jobs:\n  a:\n    label: A\n    schedule:\n      every: 6h\n    run:\n      cmd: a\n  b:\n    label: B\n    schedule:\n      every: 6h\n    run:\n      cmd: b\n",
    );
    expect(deleteJobFromDoc(d, "a")).toBe(true);
    expect(Object.keys(YAML.parse(String(d)).jobs)).toEqual(["b"]);
    expect(deleteJobFromDoc(d, "missing")).toBe(false);
  });
});

describe("jobIdsInDoc", () => {
  it("lists declared job ids", () => {
    const d = doc(
      "jobs:\n  a:\n    label: A\n  b:\n    label: B\n",
    );
    expect(jobIdsInDoc(d)).toEqual(["a", "b"]);
    expect(jobIdsInDoc(doc(""))).toEqual([]);
  });
});
