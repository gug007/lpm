// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bridge/runtime", () => ({ EventsOn: vi.fn() }));

import { selectAllInFocus } from "./menuEdit";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("selectAllInFocus", () => {
  it("selects a focused field's text", () => {
    const input = document.createElement("input");
    input.value = "hello";
    document.body.append(input);
    const select = vi.spyOn(input, "select");
    selectAllInFocus(input);
    expect(select).toHaveBeenCalled();
  });

  it("selects inside an editable element", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    document.body.append(editor);
    selectAllInFocus(editor);
    expect(exec).toHaveBeenCalledWith("selectAll");
  });

  it("leaves the app's own text alone when nothing editable is focused", () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec;
    selectAllInFocus(document.body);
    expect(exec).not.toHaveBeenCalled();
  });
});
