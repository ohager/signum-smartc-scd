import { useState } from "react";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FileSystem } from "@/lib/file-system";
import { formatDate, t } from "@/i18n/runtime";
import { useAssistant } from "../bridge/use-assistant";
import type { RestorePlan } from "../activity/restore-round";
import type { FeedEntry, FeedRound, FeedSummary } from "../activity/feed-model";
import { feedAtom } from "../state";
import { RoundDiffDialog, type RoundDiffTarget } from "./round-diff-dialog";

const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" };

function projectName(projectId: string): string {
  try {
    return FileSystem.getInstance().getFolder(projectId).name;
  } catch {
    return t("assistant.feed.unknownProject");
  }
}

/* Glyphs are symbols, not words; only the words go through i18n. */
function summaryText(s: FeedSummary): string | null {
  switch (s.kind) {
    case "compile":
      return `${s.ok ? "✓" : "✗"} ${t("assistant.feed.compile")}`; // i18n-ignore
    case "tests":
      return `${s.passed === s.total ? "✓" : "✗"} ${t("assistant.feed.tests", { passed: s.passed, total: s.total })}`; // i18n-ignore
    case "lint":
      return s.count > 0 ? `⚠ ${t("assistant.feed.lint", { count: s.count })}` : `✓ ${t("assistant.feed.lint", { count: 0 })}`; // i18n-ignore
    case "gas":
      return s.tooLow ? `⚠ ${t("assistant.feed.gas")}` : null; // i18n-ignore
    case "error":
      return `✗ ${t("assistant.feed.error", { code: s.code })}`; // i18n-ignore
    default:
      return null;
  }
}

function Entry({ entry, onDiff }: { entry: FeedEntry; onDiff?: () => void }) {
  const text = summaryText(entry.summary);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="text-muted-foreground tabular-nums">{formatDate(entry.at, TIME)}</span>
      <span className="font-mono">{entry.tool}</span>
      {entry.target && <span className="truncate text-muted-foreground">{entry.target}</span>}
      {entry.status === "running" ? <Badge variant="outline">{t("assistant.feed.running")}</Badge> : text && <span>{text}</span>}
      {onDiff && (
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onDiff}>
          {t("assistant.feed.viewDiff")}
        </Button>
      )}
    </li>
  );
}

/* Opened from the connection status. Rounds are newest first; loose calls (no round) sit apart. */
export function ActivityPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const feed = useAtomValue(feedAtom);
  const { restore, undoRestore } = useAssistant();
  const [plan, setPlan] = useState<RestorePlan | null>(null);
  const [diff, setDiff] = useState<RoundDiffTarget | null>(null);

  async function startRestore(round: FeedRound) {
    try {
      setPlan(await restore(round.roundId));
    } catch {
      toast.error(t("assistant.restore.failed"));
    }
  }

  async function confirmRestore(current: RestorePlan) {
    try {
      const { undoCheckpointId } = await current.confirm();
      toast(t("assistant.restore.done"), {
        action: {
          label: t("assistant.restore.undo"),
          onClick: () =>
            void undoRestore(undoCheckpointId).then(
              () => toast(t("assistant.restore.undone")),
              () => toast.error(t("assistant.restore.failed")),
            ),
        },
      });
    } catch {
      toast.error(t("assistant.restore.failed"));
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("assistant.feed.title")}</SheetTitle>
            <SheetDescription>{t("assistant.feed.description")}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="flex flex-col gap-4 pb-4">
              {feed.rounds.length === 0 && feed.loose.length === 0 && <p className="text-sm text-muted-foreground">{t("assistant.feed.empty")}</p>}
              {feed.rounds.map((round) => (
                <section key={round.roundId} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{projectName(round.projectId)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDate(round.startedAt, TIME)}</span>
                    {round.endedAt === null && <Badge>{t("assistant.feed.running")}</Badge>}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {round.entries.map((entry) => (
                      <Entry
                        key={entry.callId}
                        entry={entry}
                        onDiff={
                          entry.summary.kind === "write"
                            ? () => setDiff({ checkpointId: round.checkpointId, projectId: round.projectId, path: (entry.summary as { path: string }).path })
                            : undefined
                        }
                      />
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" className="self-start" onClick={() => void startRestore(round)}>
                    {t("assistant.restore.action")}
                  </Button>
                </section>
              ))}
              {feed.loose.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-muted-foreground">{t("assistant.feed.loose")}</h3>
                  <ul className="flex flex-col gap-1">
                    {feed.loose.map((entry) => (
                      <Entry key={entry.callId} entry={entry} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={plan !== null}
        onOpenChange={(o) => !o && setPlan(null)}
        onConfirm={() => plan && void confirmRestore(plan)}
        title={t("assistant.restore.title")}
        description={plan && plan.needsConfirm.length > 0 ? t("assistant.restore.userChanges") : t("assistant.restore.body")}
        confirmText={t("assistant.restore.confirm")}
        variant="destructive"
      >
        {plan && plan.needsConfirm.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {plan.needsConfirm.map((f) => (
              <li key={f} className="font-mono">
                {f}
              </li>
            ))}
          </ul>
        )}
      </ConfirmationDialog>
      <RoundDiffDialog target={diff} onClose={() => setDiff(null)} />
    </>
  );
}
