import { describe, it, expect } from "bun:test";
import { translate } from "@/i18n/runtime";
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

  it("gives every entry a title that exists in the English messages", () => {
    for (const entry of LEARN_CONTENT) {
      expect(translate(entry.titleKey)).not.toBe(entry.titleKey);
      if (entry.blurbKey) expect(translate(entry.blurbKey)).not.toBe(entry.blurbKey);
    }
  });
});

describe("railVideos / railLinks", () => {
  const entries: LearnEntry[] = [
    ...Array.from({ length: 6 }, (_, i): LearnEntry => ({
      id: `v${i}`,
      kind: "video",
      titleKey: "home.learn.smartc-repo.title",
      youtubeId: `id${i}`,
    })),
    ...Array.from({ length: 9 }, (_, i): LearnEntry => ({
      id: `l${i}`,
      kind: "link",
      titleKey: "home.learn.smartc-repo.title",
      href: "https://example.com",
    })),
    { id: "g1", kind: "guide", titleKey: "home.learn.smartc-repo.title" },
    { id: "e1", kind: "example", titleKey: "home.learn.smartc-repo.title" },
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
