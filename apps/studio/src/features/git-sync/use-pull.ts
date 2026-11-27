import { createElement, useCallback, useRef, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { t } from "@/i18n/runtime";
import { ConflictDialog } from "./conflict-dialog";
import { toastGitError } from "./git-error-toast";
import { useGitSync } from "./git-sync-context";
import type { PreparedPull } from "./sync-service";

export interface PullApi {
  /** Pulls the branch head; asks about conflicts first. Errors end up in a toast. */
  pull(): Promise<void>;
  /** Resolves the conflicts of an already prepared pull (e.g. from linking) and applies it. */
  resolve(prepared: PreparedPull): Promise<void>;
  busy: boolean;
  /** Render this once next to the component that calls `usePull`. */
  dialog: ReactElement;
}

export function usePull(projectId: string): PullApi {
  const { sync, requireToken, openTokenDialog } = useGitSync();
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [asking, setAsking] = useState<PreparedPull | null>(null);
  const answer = useRef<((choices: Record<string, "mine" | "theirs"> | null) => void) | null>(null);

  const ask = useCallback(
    (prepared: PreparedPull) =>
      new Promise<Record<string, "mine" | "theirs"> | null>((resolve) => {
        answer.current = resolve;
        setAsking(prepared);
      }),
    [],
  );
  const settle = (choices: Record<string, "mine" | "theirs"> | null) => {
    answer.current?.(choices);
    answer.current = null;
  };

  const apply = useCallback(
    async (prepared: PreparedPull) => {
      let choices: Record<string, "mine" | "theirs"> = {};
      if (prepared.conflicts.length > 0) {
        const chosen = await ask(prepared);
        if (!chosen) {
          setAsking(null);
          return;
        }
        choices = chosen;
        setApplying(true);
      }
      try {
        const res = await sync.applyPull(prepared, choices);
        toast.success(t("project.git.pull.done", { written: res.written.length, deleted: res.deleted.length }), {
          description: prepared.skipped.length
            ? t("project.git.pull.skipped", { names: prepared.skipped.join(", ") })
            : undefined,
          duration: 15000,
          action: {
            label: t("project.git.pull.undo"),
            onClick: () => {
              sync
                .undoPull(res.undoToken)
                .then(() => toast.success(t("project.git.pull.undone")))
                .catch((e) => toastGitError(e, openTokenDialog));
            },
          },
        });
      } finally {
        setApplying(false);
        setAsking(null);
      }
    },
    [ask, sync, openTokenDialog],
  );

  const resolve = useCallback(
    async (prepared: PreparedPull) => {
      try {
        await apply(prepared);
      } catch (e) {
        toastGitError(e, openTokenDialog);
      }
    },
    [apply, openTokenDialog],
  );

  const pull = useCallback(async () => {
    if (busy || !(await requireToken())) return;
    setBusy(true);
    try {
      const prepared = await sync.preparePull(projectId);
      if (!prepared) toast.success(t("project.git.pull.upToDate"));
      else await apply(prepared);
    } catch (e) {
      toastGitError(e, openTokenDialog);
    } finally {
      setBusy(false);
    }
  }, [busy, requireToken, sync, projectId, apply, openTokenDialog]);

  const dialog = createElement(ConflictDialog, {
    prepared: asking,
    busy: applying,
    onResolve: (choices) => settle(choices),
    onCancel: () => settle(null),
  });

  return { pull, resolve, busy, dialog };
}
