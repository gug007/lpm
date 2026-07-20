import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnsiLine } from "./AnsiLine";

describe("AnsiLine", () => {
  it("clears a truecolor foreground on reset", () => {
    const markup = renderToStaticMarkup(
      <AnsiLine text={"\x1b[38;2;217;119;87mModel\x1b[0m · \x1b[2mctx\x1b[0m"} />,
    );

    expect(markup).toBe(
      '<span style="color:rgb(217, 119, 87)">Model</span><span> · </span><span style="opacity:0.5">ctx</span>',
    );
  });
});
