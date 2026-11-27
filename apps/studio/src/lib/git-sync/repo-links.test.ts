import { describe, expect, it } from "bun:test";
import { MemoryStorage } from "../../features/assistant/tools/test-fs.ts";
import { REPO_LINKS_KEY, RepoLinks, type RepoLink } from "./repo-links.ts";

const link: RepoLink = {
  provider: "github",
  owner: "o",
  repo: "r",
  branch: "main",
  path: "contracts",
  marker: { format: 1 },
  baseCommit: "abc",
  baseFiles: { "a.ts": "sha1" },
};

describe("RepoLinks", () => {
  it("round-trips a link per project", () => {
    const storage = new MemoryStorage();
    new RepoLinks(storage).set("p1", link);
    const links = new RepoLinks(storage);
    expect(links.get("p1")).toEqual(link);
    expect(links.get("p2")).toBeNull();
  });
  it("removeProject drops the link", () => {
    const links = new RepoLinks(new MemoryStorage());
    links.set("p", link);
    links.removeProject("p");
    expect(links.get("p")).toBeNull();
    expect(links.all()).toEqual({});
  });
  it("emits change on set, remove and another tab's write", () => {
    const storage = new MemoryStorage();
    const links = new RepoLinks(storage);
    let count = 0;
    links.addEventListener("change", () => count++);
    links.set("p", link);
    expect(count).toBe(1);
    links.removeProject("p");
    expect(count).toBe(2);
    storage.writeFromAnotherTab(REPO_LINKS_KEY, JSON.stringify({ p: link }));
    expect(count).toBe(3);
    expect(links.get("p")).toEqual(link);
  });
  it("survives garbage in storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(REPO_LINKS_KEY, "{oops");
    expect(new RepoLinks(storage).all()).toEqual({});
  });
});
