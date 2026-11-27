/** relPath -> git blob SHA. */
export type Shas = Record<string, string>;

export type PullAction = { kind: "write"; relPath: string } | { kind: "delete"; relPath: string };

/** `null` = absent on that side. */
export interface Conflict {
  relPath: string;
  local: string | null;
  remote: string | null;
}

export type SyncState = "in_sync" | "local" | "remote" | "diverged";

const byPath = (a: { relPath: string }, b: { relPath: string }) =>
  a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0;

const has = (shas: Shas, key: string): string | undefined =>
  Object.hasOwn(shas, key) ? shas[key] : undefined;

function takeRemote(relPath: string, remote: Shas): PullAction {
  return has(remote, relPath) === undefined
    ? { kind: "delete", relPath }
    : { kind: "write", relPath };
}

/** Three-way decision per path from blob SHAs of base, local and remote. */
export function planPull(
  base: Shas,
  local: Shas,
  remote: Shas,
): { actions: PullAction[]; conflicts: Conflict[] } {
  const actions: PullAction[] = [];
  const conflicts: Conflict[] = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const relPath of paths) {
    const b = has(base, relPath);
    const l = has(local, relPath);
    const r = has(remote, relPath);
    if (l === r || r === b) continue;
    if (l === b) actions.push(takeRemote(relPath, remote));
    else conflicts.push({ relPath, local: l ?? null, remote: r ?? null });
  }
  actions.sort(byPath);
  conflicts.sort(byPath);
  return { actions, conflicts };
}

/** Applies per-conflict choices; "theirs" becomes an action, "mine" nothing. Throws on a missing choice. */
export function resolvePull(
  plan: { actions: PullAction[]; conflicts: Conflict[] },
  choices: Record<string, "mine" | "theirs">,
  remote: Shas,
): PullAction[] {
  const actions = [...plan.actions];
  for (const { relPath } of plan.conflicts) {
    const choice = Object.hasOwn(choices, relPath) ? choices[relPath] : undefined;
    if (choice === undefined) throw new Error(`No choice for conflict: ${relPath}`);
    if (choice === "theirs") actions.push(takeRemote(relPath, remote));
  }
  return actions.sort(byPath);
}

/** Paths to upload and to delete so the remote matches local, relative to base. */
export function localChanges(base: Shas, local: Shas): { upserts: string[]; deletes: string[] } {
  const upserts = Object.keys(local).filter((p) => has(base, p) !== local[p]).sort();
  const deletes = Object.keys(base).filter((p) => !Object.hasOwn(local, p)).sort();
  return { upserts, deletes };
}

export function syncState(localChangeCount: number, remoteAhead: boolean): SyncState {
  if (localChangeCount > 0) return remoteAhead ? "diverged" : "local";
  return remoteAhead ? "remote" : "in_sync";
}
