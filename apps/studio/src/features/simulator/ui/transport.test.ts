import { describe, expect, it } from "bun:test";
import { transportFor } from "./transport";

describe("transportFor", () => {
  it("offers Start before the contract has moved this round", () => {
    const t = transportFor("running", false);
    expect(t.runLabel).toBe("Start");
    expect(t.runDisabled).toBe(false);
    expect(t.canStep).toBe(true);
  });

  it("offers Continue once it has moved", () => {
    expect(transportFor("running", true).runLabel).toBe("Continue");
  });

  /**
   * The bug this module exists for. `finished` is the AT's "done for this
   * round", not "dead" — the contract runs again in the next block. The
   * toolbar used to grey out Continue and Step and say nothing, which reads as
   * a dead end, and reads worst of all when a breakpoint sits on the line the
   * instruction pointer returns to: the editor marks that line, so it looks
   * like a clean stop the tool then refuses to resume from.
   */
  it("points at the next block when the round is over", () => {
    for (const status of ["finished", "stopped"] as const) {
      const t = transportFor(status, true);
      expect(t.runDisabled).toBe(true);
      expect(t.canStep).toBe(false);
      expect(t.emphasise).toBe("forge");
      expect(t.note).toContain("next block");
    }
  });

  it("never emphasises forging while the contract can still move", () => {
    for (const hasMoved of [false, true]) {
      expect(transportFor("running", hasMoved).emphasise).toBe("run");
      expect(transportFor("ready", hasMoved).emphasise).toBe("run");
    }
  });

  it("sends a halted contract to Reset, not to the next block", () => {
    const t = transportFor("error", true);
    expect(t.runDisabled).toBe(true);
    expect(t.canStep).toBe(false);
    // Forging would not revive it; only starting over will.
    expect(t.emphasise).toBe("run");
    expect(t.note).toContain("Reset");
  });

  it("says nothing while there is nothing to explain", () => {
    expect(transportFor("running", true).note).toBe("");
    expect(transportFor("ready", false).note).toBe("");
  });
});
