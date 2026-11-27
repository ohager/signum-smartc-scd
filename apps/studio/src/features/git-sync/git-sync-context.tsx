import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FileSystem } from "@/lib/file-system";
import { LocalMetadataStorage } from "@/lib/file-system/content-store";
import { flushPendingSaves } from "@/lib/pending-saves";
import { GitHubProvider } from "@/lib/git-sync/github-provider";
import { GitSyncError } from "@/lib/git-sync/errors";
import { RepoLinks, type RepoLink } from "@/lib/git-sync/repo-links";
import { TokenStore } from "@/lib/git-sync/token-store";
import { jotaiStore } from "@/stores/jotai-store";
import { AssistantContext } from "@/features/assistant/bridge/use-assistant";
import { lockedProjectsAtom } from "@/features/assistant/state";
import { IdbCheckpointStore } from "@/features/assistant/rounds/idb-checkpoint-store";
import type { FileSystemEvent } from "@/lib/file-system/file-system-types";
import { GitSync } from "./sync-service";
import { GitHubTokenDialog } from "./github-token-dialog";

export interface GitSyncApi {
  sync: GitSync;
  links: RepoLinks;
  tokens: TokenStore;
  /** Resolves true when a token is stored; opens the token dialog first when there is none. */
  requireToken(): Promise<boolean>;
  /** Always opens the token dialog (to replace or forget the stored token); resolves true if a token is stored when it closes. */
  openTokenDialog(): Promise<boolean>;
}

const GitSyncContext = createContext<GitSyncApi | null>(null);

export function GitSyncProvider({ children }: { children: ReactNode }) {
  const runtime = useContext(AssistantContext);
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

  const [dialogOpen, setDialogOpen] = useState(false);
  const waiters = useRef<((ok: boolean) => void)[]>([]);

  const api = useMemo(() => {
    const storage = new LocalMetadataStorage();
    const tokens = new TokenStore(storage);
    const links = new RepoLinks(storage);
    const sync = new GitSync({
      fs: FileSystem.getInstance(),
      links,
      provider: () => {
        const token = tokens.get();
        if (!token) throw new GitSyncError("no_token", "No GitHub token.");
        return new GitHubProvider(token);
      },
      checkpoints: new IdbCheckpointStore(),
      clock: { now: () => Date.now() },
      flush: flushPendingSaves,
      isLocked: (projectId) => jotaiStore.get(lockedProjectsAtom).has(projectId),
      markTookOver: (projectId) => runtimeRef.current?.rounds.markTookOver(projectId),
    });
    return { sync, links, tokens };
  }, []);

  // A deleted project takes its link with it; a project later created never inherits stale state.
  useEffect(() => {
    const fs = FileSystem.getInstance();
    const onDeleted = (e: Event) => {
      const { id } = (e as CustomEvent<FileSystemEvent>).detail;
      if (api.links.get(id)) api.links.removeProject(id);
    };
    fs.addEventListener("folder:deleted", onDeleted);
    return () => fs.removeEventListener("folder:deleted", onDeleted);
  }, [api]);

  const settle = useCallback((ok: boolean) => {
    for (const resolve of waiters.current.splice(0)) resolve(ok);
  }, []);

  const openTokenDialog = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        waiters.current.push(resolve);
        setDialogOpen(true);
      }),
    [],
  );

  const requireToken = useCallback(
    () => (api.tokens.get() ? Promise.resolve(true) : openTokenDialog()),
    [api, openTokenDialog],
  );

  const value = useMemo<GitSyncApi>(
    () => ({ ...api, requireToken, openTokenDialog }),
    [api, requireToken, openTokenDialog],
  );

  return (
    <GitSyncContext.Provider value={value}>
      {children}
      <GitHubTokenDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) settle(api.tokens.get() !== null);
        }}
        tokens={api.tokens}
      />
    </GitSyncContext.Provider>
  );
}

export function useGitSync(): GitSyncApi {
  const ctx = useContext(GitSyncContext);
  if (!ctx) throw new Error("useGitSync must be used inside GitSyncProvider.");
  return ctx;
}

/** The project's repo link; re-renders when any link changes. */
export function useRepoLink(projectId: string): RepoLink | null {
  const { links } = useGitSync();
  const [link, setLink] = useState(() => links.get(projectId));
  useEffect(() => {
    const refresh = () => setLink(links.get(projectId));
    refresh();
    links.addEventListener("change", refresh);
    return () => links.removeEventListener("change", refresh);
  }, [links, projectId]);
  return link;
}
