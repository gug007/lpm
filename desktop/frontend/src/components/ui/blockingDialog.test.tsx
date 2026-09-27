// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { blockingDialogOpen } from "./blockingDialog";
import { Modal } from "./Modal";

const roots: (() => void)[] = [];
afterEach(() => roots.splice(0).forEach((done) => done()));

async function show(backdrop: boolean) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () =>
    root.render(
      <Modal open backdrop={backdrop} onClose={() => {}}>
        <p>dialog</p>
      </Modal>,
    ),
  );
  roots.push(() => {
    act(() => root.unmount());
    el.remove();
  });
}

describe("blockingDialogOpen", () => {
  it("is false with nothing open", () => {
    expect(blockingDialogOpen()).toBe(false);
  });

  it("leaves the app live behind a floating dialog", async () => {
    await show(false);
    expect(blockingDialogOpen()).toBe(false);
  });

  it("is true while a dialog with a backdrop is open", async () => {
    await show(true);
    expect(blockingDialogOpen()).toBe(true);
  });
});
