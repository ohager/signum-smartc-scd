import type { MetadataStorage } from "../file-system/content-store.ts";
import type { Marker } from "./marker.ts";
import type { Shas } from "./plan.ts";

export const REPO_LINKS_KEY = "smartc-studio:repo-links";

export interface RepoLink {
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  /** Marker folder, "" = repo root. */
  path: string;
  /** Parsed marker content. */
  marker: Marker;
  baseCommit: string;
  baseFiles: Shas;
}

export class RepoLinks extends EventTarget {
  constructor(private readonly storage: MetadataStorage) {
    super();
    storage.watch?.(REPO_LINKS_KEY, () => this.dispatchEvent(new Event("change")));
  }

  get(projectId: string): RepoLink | null {
    return this.all()[projectId] ?? null;
  }

  set(projectId: string, link: RepoLink): void {
    this.write({ ...this.all(), [projectId]: link });
  }

  removeProject(projectId: string): void {
    const { [projectId]: _removed, ...rest } = this.all();
    this.write(rest);
  }

  all(): Record<string, RepoLink> {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(REPO_LINKS_KEY) ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, RepoLink>;
      }
    } catch {
      // unreadable storage counts as empty
    }
    return {};
  }

  private write(links: Record<string, RepoLink>): void {
    this.storage.setItem(REPO_LINKS_KEY, JSON.stringify(links));
    this.dispatchEvent(new Event("change"));
  }
}
