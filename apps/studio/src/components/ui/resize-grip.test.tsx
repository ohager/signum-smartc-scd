import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResizeGrip } from "./resize-grip";

describe("ResizeGrip", () => {
  it("draws the grip knob in the climate's colours", () => {
    const html = renderToStaticMarkup(<ResizeGrip />);
    expect(html).toContain('data-slot="resize-grip"');
    expect(html).toContain("var(--border-2)");
    expect(html).toContain("aria-hidden");
  });
});
