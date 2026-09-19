import { describe, it, expect } from "bun:test";
import { DURATIONS, motionCssVariables } from "./tokens";

describe("motionCssVariables", () => {
  it("publishes every duration in milliseconds", () => {
    const vars = motionCssVariables();
    expect(vars["--motion-instant"]).toBe("120ms");
    expect(vars["--motion-quick"]).toBe("200ms");
    expect(vars["--motion-base"]).toBe("350ms");
    expect(vars["--motion-calm"]).toBe("550ms");
  });

  it("publishes the easings CSS can use verbatim, under kebab-case names", () => {
    const vars = motionCssVariables();
    expect(vars["--ease-out"]).toBe("cubic-bezier(.22, 1, .36, 1)");
    // The key is `inOut`; the custom property CSS reads is `--ease-in-out`.
    expect(vars["--ease-in-out"]).toBe("cubic-bezier(.4, 0, .2, 1)");
  });

  it("publishes one variable per declared duration, so the two never drift", () => {
    const vars = motionCssVariables();
    for (const name of Object.keys(DURATIONS)) {
      expect(vars[`--motion-${name}`]).toBeDefined();
    }
  });
});
