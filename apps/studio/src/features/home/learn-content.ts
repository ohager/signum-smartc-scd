/**
 * Learning material shown in the home page's Learn rail.
 *
 * Bundled and typed on purpose — no runtime fetching, so the rail is instant,
 * works offline and cannot be broken by a bad hand-edit. Adding a video means
 * adding an entry below and pushing.
 *
 * `guide` and `example` are declared but unused: the Learning Hub sub-project
 * will render those kinds without changing this shape.
 */

import type { PlainKey } from "@/i18n/runtime";

export type LearnKind = "video" | "link" | "guide" | "example";

export interface LearnEntry {
  id: string;
  kind: LearnKind;
  titleKey: PlainKey;
  blurbKey?: PlainKey;
  /** Outbound URL — used by `link` entries. */
  href?: string;
  /** YouTube video id — required for `video` entries. */
  youtubeId?: string;
}

export const MAX_RAIL_VIDEOS = 3;
export const MAX_RAIL_LINKS = 5;

/**
 * Videos are added here as they are published, their text in
 * each locale's `home.json` under `learn.<id>`. Each needs a `youtubeId` (the
 * `v=` parameter of the watch URL); `learn-content.test.ts` enforces that.
 */
export const LEARN_CONTENT: LearnEntry[] = [
  {
    id: "smartc-repo",
    kind: "link",
    titleKey: "home.learn.smartc-repo.title",
    blurbKey: "home.learn.smartc-repo.blurb",
    href: "https://github.com/deleterium/SmartC",
  },
  {
    id: "signum-docs",
    kind: "link",
    titleKey: "home.learn.signum-docs.title",
    blurbKey: "home.learn.signum-docs.blurb",
    href: "https://docs.signum.network/signum",
  },
  {
    id: "signum-network",
    kind: "link",
    titleKey: "home.learn.signum-network.title",
    blurbKey: "home.learn.signum-network.blurb",
    href: "https://signum.network",
  },
];

/** Videos for the rail, in declared order, capped. */
export function railVideos(entries: readonly LearnEntry[] = LEARN_CONTENT): LearnEntry[] {
  return entries.filter((entry) => entry.kind === "video").slice(0, MAX_RAIL_VIDEOS);
}

/** Outbound links for the rail, in declared order, capped. */
export function railLinks(entries: readonly LearnEntry[] = LEARN_CONTENT): LearnEntry[] {
  return entries.filter((entry) => entry.kind === "link").slice(0, MAX_RAIL_LINKS);
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

/**
 * Thumbnail served by YouTube. Accepted tradeoff: one image request to Google
 * on page load, justified because the cards link to YouTube anyway. Callers
 * must handle `onError` so a failed load never leaves a broken frame.
 */
export function youtubeThumbnailUrl(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
}
