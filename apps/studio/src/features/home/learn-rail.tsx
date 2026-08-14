import {
  railLinks,
  railVideos,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "@/features/home/learn-content";
import { ArrowUpRightIcon, PlayIcon } from "lucide-react";
import { useState } from "react";

function VideoCard({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  return (
    <a
      href={youtubeWatchUrl(youtubeId)}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-md border transition-colors hover:border-signum-blue/40 dark:hover:border-signum-lightblue/40"
    >
      <div className="relative flex aspect-video items-center justify-center bg-muted">
        {thumbnailFailed ? (
          <PlayIcon className="h-6 w-6 text-muted-foreground" />
        ) : (
          <img
            src={youtubeThumbnailUrl(youtubeId)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setThumbnailFailed(true)}
          />
        )}
        {/* Play affordance over the thumbnail, brightened on hover. */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <PlayIcon className="h-7 w-7 fill-white text-white drop-shadow" />
        </span>
      </div>
      <span className="block px-2.5 py-2 text-xs leading-snug">{title}</span>
    </a>
  );
}

export function LearnRail() {
  const videos = railVideos();
  const links = railLinks();

  return (
    <aside className="w-full shrink-0 border-t px-6 py-6 lg:w-72 lg:border-l lg:border-t-0">
      <h2 className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Learn
        <span className="h-px flex-1 bg-border lg:hidden" />
      </h2>

      {videos.length > 0 && (
        <div className="mb-5 flex flex-col gap-2.5">
          {videos.map((video) => (
            <VideoCard key={video.id} youtubeId={video.youtubeId!} title={video.title} />
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group block rounded-md border border-transparent px-2 py-1.5 -mx-2 transition-colors hover:border-border hover:bg-muted/60"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                {link.title}
                <ArrowUpRightIcon className="h-3 w-3 shrink-0 text-muted-foreground transition-all group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-signum-blue dark:group-hover:text-signum-lightblue" />
              </span>
              {link.blurb && (
                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                  {link.blurb}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
