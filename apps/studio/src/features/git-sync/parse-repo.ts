import type { RepoRef } from "@/lib/git-sync/provider";

const NAME = /^[A-Za-z0-9._-]+$/;

/** `owner/repo` or a github.com URL (optional `.git`, trailing slash, `/tree/...`); null when it is neither. */
export function parseRepo(input: string): RepoRef | null {
  let s = input.trim();
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i.exec(s);
  if (url) s = url[1];
  else if (/^(?:https?:\/\/)/i.test(s) || /^[^/]*\.[^/]*\//.test(s)) return null;
  const parts = s.replace(/\/+$/, "").split("/");
  if (!url && parts.length !== 2) return null;
  const [owner, rawRepo] = parts;
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/i, "");
  return NAME.test(owner) && NAME.test(repo) && repo !== "." && repo !== ".." ? { owner, repo } : null;
}
