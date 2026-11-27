import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n/runtime";
import { GitSyncError } from "@/lib/git-sync/errors";
import { suggestCommitMessage } from "./commit-message";
import { gitErrorMessage } from "./git-error-message";
import { toastGitError } from "./git-error-toast";
import { useGitSync, useRepoLink } from "./git-sync-context";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the branch moved and the user wants to pull instead. */
  onPull: () => void;
}

export function CommitDialog({ projectId, open, onOpenChange, onPull }: Props) {
  const { sync, openTokenDialog } = useGitSync();
  const link = useRepoLink(projectId);
  const [changes, setChanges] = useState<{ upserts: string[]; deletes: string[] } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChanges(null);
    setError(null);
    setMoved(false);
    let cancelled = false;
    sync
      .pendingChanges(projectId)
      .then((c) => {
        if (cancelled) return;
        setChanges(c);
        setMessage(suggestCommitMessage(c, link?.baseFiles ?? {}));
      })
      .catch((e) => !cancelled && setError(gitErrorMessage(e)));
    return () => {
      cancelled = true;
    };
    // The link changes after a push; only opening should reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, sync]);

  const push = async () => {
    if (busy || !message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { commit } = await sync.push(projectId, message);
      toast.success(t("project.git.commit.pushed", { commit: commit.slice(0, 7) }));
      onOpenChange(false);
    } catch (e) {
      if (e instanceof GitSyncError && (e.code === "auth" || e.code === "forbidden")) toastGitError(e, openTokenDialog);
      else {
        setError(gitErrorMessage(e));
        setMoved(e instanceof GitSyncError && e.code === "not_fast_forward");
      }
    } finally {
      setBusy(false);
    }
  };

  const flagged = changes
    ? [
        ...changes.upserts.map((p) => ({ path: p, flag: link && Object.hasOwn(link.baseFiles, p) ? "M" : "A" })),
        ...changes.deletes.map((p) => ({ path: p, flag: "D" })),
      ].sort((a, b) => (a.path < b.path ? -1 : 1))
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("project.git.commit.title")}</DialogTitle>
          <DialogDescription>
            {t("project.git.commit.description", {
              repo: link ? `${link.owner}/${link.repo}` : "",
              branch: link?.branch ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>{t("project.git.commit.changes")}</Label>
          {changes === null && !error && (
            <p className="text-sm text-muted-foreground">{t("project.git.commit.loading")}</p>
          )}
          {changes && flagged.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("project.git.commit.none")}</p>
          )}
          {flagged.length > 0 && (
            <ul className="max-h-40 overflow-y-auto font-mono text-xs">
              {flagged.map((f) => (
                <li key={f.path}>
                  {f.flag} {f.path}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="commit-message">{t("project.git.commit.message")}</Label>
          <Textarea
            id="commit-message"
            value={message}
            rows={5}
            className="font-mono"
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          {moved && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onPull();
              }}
            >
              {t("project.git.commit.pullNow")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="accent"
            onClick={() => void push()}
            disabled={busy || !changes || flagged.length === 0 || !message.trim()}
          >
            {busy ? t("project.git.commit.pushing") : t("project.git.commit.push")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
