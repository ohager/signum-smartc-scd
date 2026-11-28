import { describe, expect, it } from "bun:test";
import { createRemoteThrottle } from "./throttle";

describe("createRemoteThrottle", () => {
  it("allows one remote check per project per interval", () => {
    let t = 0;
    const th = createRemoteThrottle(30_000, () => t);
    expect(th.shouldCheck("p")).toBe(true);
    expect(th.shouldCheck("p")).toBe(false);
    expect(th.shouldCheck("q")).toBe(true);
    t = 30_000;
    expect(th.shouldCheck("p")).toBe(true);
  });
});
