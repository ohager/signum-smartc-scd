import { describe, expect, it, spyOn } from "bun:test";
import { flushPendingSaves, registerPendingSave } from "./pending-saves";

describe("pending saves", () => {
  it("awaits every registered flush", async () => {
    const done: string[] = [];
    const a = registerPendingSave(async () => { await Promise.resolve(); done.push("a"); });
    const b = registerPendingSave(() => { done.push("b"); });
    await flushPendingSaves();
    expect(done.sort()).toEqual(["a", "b"]);
    a(); b();
  });

  it("forgets a flush once unregistered", async () => {
    let calls = 0;
    const off = registerPendingSave(() => { calls++; });
    off();
    await flushPendingSaves();
    expect(calls).toBe(0);
  });

  it("does not reject when a flush throws", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const off = registerPendingSave(() => Promise.reject(new Error("disk full")));
    await flushPendingSaves();
    expect(error).toHaveBeenCalled();
    off();
    error.mockRestore();
  });

  it("does not reject when a flush throws synchronously", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    const off = registerPendingSave(() => {
      throw new Error("sync boom");
    });
    await flushPendingSaves();
    expect(error).toHaveBeenCalled();
    off();
    error.mockRestore();
  });
});
