import { describe, expect, it } from "bun:test";
import { railMark } from "./rail-marks";

describe("railMark", () => {
  it("fills a good fact green and a bad one magenta", () => {
    expect(railMark("good").fill).toBe("var(--green)");
    expect(railMark("bad").fill).toBe("var(--mag)");
  });

  /**
   * The rule the whole rail rests on. A filled mark must never be readable as
   * "this stage is done" — the cells report a fact, and a stage that has not
   * answered yet is an outline, not a tick. Fill it and the step numbers the
   * rail exists to avoid are back through the side door.
   */
  it("leaves an unknown fact hollow", () => {
    expect(railMark("neutral").fill).toBe("none");
    expect(railMark("neutral").stroke).toBe("var(--dim)");
  });

  it("uses one colour per mark, so the outline never contradicts the fill", () => {
    for (const tone of ["good", "bad"] as const) {
      expect(railMark(tone).stroke).toBe(railMark(tone).fill);
    }
  });
});
