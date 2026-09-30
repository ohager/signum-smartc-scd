import { describe, expect, it } from "bun:test";
import { switchLocale } from "./switch";
import { STORAGE_KEY } from "./locales";

describe("switchLocale", () => {
  it("flushes, then stores, then reloads — in that order", async () => {
    const order: string[] = [];
    await switchLocale("de", {
      flush: async () => { order.push("flush"); },
      storage: { setItem: (k, v) => order.push(`set ${k}=${v}`) },
      reload: () => order.push("reload"),
    });
    expect(order).toEqual(["flush", `set ${STORAGE_KEY}=de`, "reload"]);
  });

  it("reloads even when storage is unavailable", async () => {
    let reloaded = false;
    await switchLocale("de", {
      flush: async () => {},
      storage: { setItem: () => { throw new Error("private mode"); } },
      reload: () => { reloaded = true; },
    });
    expect(reloaded).toBe(true);
  });
});
