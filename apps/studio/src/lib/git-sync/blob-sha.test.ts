import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { gitBlobSha } from "./blob-sha.ts";

describe("gitBlobSha", () => {
  it("matches git hash-object", async () => {
    expect(await gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
    expect(await gitBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
  it("hashes UTF-8 bytes, not UTF-16 units", async () => {
    const text = "€ ✓\n";
    const bytes = Buffer.from(text, "utf8");
    const ref = createHash("sha1")
      .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
      .digest("hex");
    expect(await gitBlobSha(text)).toBe(ref);
  });
});
