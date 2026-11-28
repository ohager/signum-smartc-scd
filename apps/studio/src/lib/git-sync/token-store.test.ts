import { describe, expect, it } from "bun:test";
import { MemoryStorage } from "../../features/assistant/tools/test-fs.ts";
import { TokenStore } from "./token-store.ts";

describe("TokenStore", () => {
  it("token set/get/clear", () => {
    const store = new TokenStore(new MemoryStorage());
    expect(store.get()).toBeNull();
    store.set("t");
    expect(store.get()).toBe("t");
    store.clear();
    expect(store.get()).toBeNull();
  });
});
