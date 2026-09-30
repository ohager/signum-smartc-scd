import { describe, expect, it } from "bun:test";
import { updateFileText } from "./update-file";

describe("updateFileText", () => {
  it("writes the edited text and skips no-op edits", async () => {
    const store: Record<string, string> = { f: "a" };
    let writes = 0;
    const fs = {
      loadFile: async <T,>(id: string) => ({ content: store[id] as T }),
      saveFile: async <T,>(id: string, content: T) => {
        writes++;
        store[id] = content as string;
      },
    };
    expect(await updateFileText(fs, "f", (t) => t + "b")).toBe("ab");
    await updateFileText(fs, "f", (t) => t);
    expect(store.f).toBe("ab");
    expect(writes).toBe(1);
  });
});
