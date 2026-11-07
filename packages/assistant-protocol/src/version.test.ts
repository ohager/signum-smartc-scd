import { describe, expect, it } from "bun:test";
import { catalogHash } from "./version";

describe("version", () => {
  it("catalog hash is pinned — bump PROTOCOL_VERSION when it changes", async () => {
    expect(await catalogHash()).toMatchSnapshot();
  });
});
