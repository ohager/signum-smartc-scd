import { describe, it, expect } from "bun:test";
import {
  LEARN_CONTENT,
  MAX_RAIL_LINKS,
  MAX_RAIL_VIDEOS,
  railLinks,
  railVideos,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type LearnEntry,
} from "./learn-content";

describe("LEARN_CONTENT", () => {
  it("has unique ids", () => {
    const ids = LEARN_CONTENT.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every video a youtubeId", () => {
    for (const entry of LEARN_CONTENT.filter((e) => e.kind === "video")) {
      expect(entry.youtubeId).toBeTruthy();
    }
  });

  it("gives every link an absolute https href", () => {
    for (const entry of LEARN_CONTENT.filter((e) => e.kind === "link")) {
      expect(entry.href).toMatch(/^https:\/\//);
    }
  });

  it("gives every entry a non-empty title", () => {
    for (const entry of LEARN_CONTENT) {
      expect(entry.title.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("railVideos / railLinks", () => {
  const entries: LearnEntry[] = [
    ...Array.from({ length: 6 }, (_, i): LearnEntry => ({
      id: `v${i}`,
      kind: "video",
      title: `video ${i}`,
      youtubeId: `id${i}`,
    })),
    ...Array.from({ length: 9 }, (_, i): LearnEntry => ({
      id: `l${i}`,
      kind: "link",
      title: `link ${i}`,
      href: "https://example.com",
    })),
    { id: "g1", kind: "guide", title: "a guide" },
    { id: "e1", kind: "example", title: "an example" },
  ];

  it("caps videos at MAX_RAIL_VIDEOS, preserving order", () => {
    expect(railVideos(entries).map((e) => e.id)).toEqual(["v0", "v1", "v2"]);
    expect(railVideos(entries)).toHaveLength(MAX_RAIL_VIDEOS);
  });

  it("caps links at MAX_RAIL_LINKS, preserving order", () => {
    expect(railLinks(entries).map((e) => e.id)).toEqual(["l0", "l1", "l2", "l3", "l4"]);
    expect(railLinks(entries)).toHaveLength(MAX_RAIL_LINKS);
  });

  it("ignores guide and example kinds", () => {
    const ids = [...railVideos(entries), ...railLinks(entries)].map((e) => e.id);
    expect(ids).not.toContain("g1");
    expect(ids).not.toContain("e1");
  });

  it("defaults to the bundled content", () => {
    expect(railLinks().length).toBeGreaterThan(0);
  });
});

describe("youtube url helpers", () => {
  it("builds a watch url", () => {
    expect(youtubeWatchUrl("abc123")).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("builds a thumbnail url", () => {
    expect(youtubeThumbnailUrl("abc123")).toBe("https://img.youtube.com/vi/abc123/mqdefault.jpg");
  });
});
