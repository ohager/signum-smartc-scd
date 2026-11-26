import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolbarReadout } from "./surface-toolbar";

const LONG = "recording · stores the first metadata entry: [item][0] = count, [item][1] = txId";

describe("ToolbarReadout", () => {
  it("bounds a long value so it cannot push the other toolbar groups into each other", () => {
    const html = renderToStaticMarkup(<ToolbarReadout items={[{ label: "", value: LONG }]} />);
    expect(html).toMatch(/class="[^"]*max-w-\[[^"]*truncate/);
  });

  it("keeps the full value reachable as a tooltip", () => {
    const html = renderToStaticMarkup(<ToolbarReadout items={[{ label: "", value: LONG }]} />);
    expect(html).toContain(`title="${LONG}"`);
  });
});
