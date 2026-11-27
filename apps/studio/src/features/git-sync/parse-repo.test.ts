import { describe, expect, it } from "bun:test";
import { parseRepo } from "./parse-repo";

describe("parseRepo", () => {
  it("parses owner/repo forms", () => {
    for (const s of [
      "veridibloc/smart-contracts",
      "https://github.com/veridibloc/smart-contracts",
      "https://github.com/veridibloc/smart-contracts.git",
      "github.com/veridibloc/smart-contracts/tree/main/x",
      "  veridibloc/smart-contracts/  ",
    ])
      expect(parseRepo(s)).toEqual({ owner: "veridibloc", repo: "smart-contracts" });
    for (const s of ["", "foo", "https://gitlab.com/a/b", "a/b/c d", "a/"]) expect(parseRepo(s)).toBeNull();
  });
});
