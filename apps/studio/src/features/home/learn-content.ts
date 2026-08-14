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

export type LearnKind = "video" | "link" | "guide" | "example";

export interface LearnEntry {
  id: string;
  kind: LearnKind;
  title: string;
  blurb?: string;
  /** Outbound URL — used by `link` entries. */
  href?: string;
  /** YouTube video id — required for `video` entries. */
  youtubeId?: string;
}

export const MAX_RAIL_VIDEOS = 3;
export const MAX_RAIL_LINKS = 5;

/**
 * Videos are added here as they are published. Each needs a `youtubeId` (the
 * `v=` parameter of the watch URL); `learn-content.test.ts` enforces that.
 */
export const LEARN_CONTENT: LearnEntry[] = [
  {
    id: "smartc-repo",
    kind: "link",
    title: "SmartC language & compiler",
    blurb: "Syntax reference, built-in functions and the compiler itself.",
    href: "https://github.com/deleterium/SmartC",
  },
  {
    id: "signum-docs",
    kind: "link",
    title: "Signum documentation",
    blurb: "How the Signum network, accounts and transactions work.",
    href: "https://docs.signum.network/signum",
  },
  {
    id: "signum-network",
    kind: "link",
    title: "Signum network",
    blurb: "The project, its ecosystem and community.",
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
