import { describe, expect, it } from "bun:test";
import { writeThrough } from "./write-through";

/**
 * A buffer the way React gives it to us: `onChange` schedules a re-render,
 * and the ref only catches up when that render happens — which is after the
 * synchronous save call.
 */
function fakeBuffer(initial: string) {
  const saved: string[] = [];
  const buffer = {
    textRef: { current: initial },
    onChange: (_value: string | undefined) => undefined,
    saveNow: async () => {
      saved.push(buffer.textRef.current);
    },
  };
  return { buffer, saved };
}

describe("writeThrough", () => {
  it("saves the edited text, not the text from before the edit", async () => {
    const { buffer, saved } = fakeBuffer("a");
    await writeThrough(buffer, (t) => t + "b");
    expect(saved).toEqual(["ab"]);
  });

  it("lets a second edit build on the first before any re-render", async () => {
    const { buffer, saved } = fakeBuffer("a");
    await Promise.all([writeThrough(buffer, (t) => t + "b"), writeThrough(buffer, (t) => t + "c")]);
    expect(saved.at(-1)).toBe("abc");
  });
});
