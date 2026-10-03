// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  open: vi.fn(),
  destroy: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../bridge/commands", () => ({ NotesReadFileAsInput: mocks.read }));
vi.mock("./pdf/pdfEngine", () => ({ openPdf: mocks.open }));

import { usePdfPreview, type PdfPreview } from "./pdfPreview";

const PAGE = { width: 612, height: 792, draw: vi.fn(), drawText: vi.fn() };
const PEER_PDF = "/@peer-abcd1234/srv/app/receipt.pdf";

let container: HTMLDivElement;
let root: Root;
let latest: PdfPreview;

function Probe({ path }: { path: string }) {
  latest = usePdfPreview(path, true);
  return null;
}

async function show(path: string) {
  await act(async () => root.render(<Probe path={path} />));
  for (let i = 0; i < 4; i++) await act(async () => {});
}

function failure(name: string, message: string) {
  return Object.assign(new Error(message), { name });
}

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  mocks.read.mockResolvedValue({ data: btoa("%PDF-1.4 receipt") });
  mocks.open.mockReturnValue({ pages: Promise.resolve([PAGE, PAGE]), destroy: mocks.destroy });
});

afterEach(() => {
  act(() => root.unmount());
  vi.clearAllMocks();
});

describe("usePdfPreview", () => {
  it("hands the file's bytes to the renderer and lists its pages", async () => {
    await show("/Users/me/receipt.pdf");
    expect(mocks.read).toHaveBeenCalledWith("/Users/me/receipt.pdf", 64 * 1024 * 1024);
    const [bytes] = mocks.open.mock.calls[0];
    expect(new TextDecoder().decode(bytes)).toBe("%PDF-1.4 receipt");
    expect(latest.pages).toHaveLength(2);
    expect(latest.error).toBeNull();
    expect(latest.meta).toBe("16 B · 2 pages");
  });

  it("reads a file on a paired machine up to the same size", async () => {
    await show(PEER_PDF);
    expect(mocks.read).toHaveBeenCalledWith(PEER_PDF, 64 * 1024 * 1024);
    expect(latest.pages).toHaveLength(2);
  });

  it("says plainly when the file isn't a PDF it can read", async () => {
    mocks.open.mockReturnValue({
      pages: Promise.reject(failure("InvalidPDFException", "Invalid PDF structure.")),
      destroy: mocks.destroy,
    });
    await show("/Users/me/broken.pdf");
    expect(latest.pages).toBeNull();
    expect(latest.error).toBe("This file isn't a readable PDF.");
  });

  it("names a locked PDF", async () => {
    mocks.open.mockReturnValue({
      pages: Promise.reject(failure("PasswordException", "No password given")),
      destroy: mocks.destroy,
    });
    await show("/Users/me/locked.pdf");
    expect(latest.error).toBe("This PDF is password-protected.");
  });

  it("passes on why the bytes couldn't be read", async () => {
    mocks.read.mockRejectedValue("receipt.pdf exceeds 8MB limit");
    await show(PEER_PDF);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(latest.error).toBe("receipt.pdf exceeds 8MB limit");
  });

  it("lets go of the last document when another file opens", async () => {
    await show("/Users/me/a.pdf");
    await show("/Users/me/b.pdf");
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
    expect(mocks.open).toHaveBeenCalledTimes(2);
  });
});
