import { useState } from "react";
import { useAtomValue } from "jotai";
import { BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { t } from "@/i18n/runtime";
import { useAssistant } from "../bridge/use-assistant";
import { hasActivity } from "../activity/feed-model";
import { assistantPortAtom, feedAtom } from "../state";
import { ActivityPanel } from "./activity-panel";
import { ConnectDialog } from "./connect-dialog";
import { RichText } from "./rich-text";

/* Sidebar footer entry: offers Connect when idle, shows the session when connected, explains failures. */
export function AssistantStatus() {
  const { state, disconnect } = useAssistant();
  const port = useAtomValue(assistantPortAtom);
  const feed = useAtomValue(feedAtom);
  const [open, setOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  /* The feed outlives the connection, so Restore stays reachable until there is nothing to show. */
  const showActivity = hasActivity(feed);
  const activityButton = showActivity && (
    <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}>
      {t("assistant.status.activity")}
    </Button>
  );
  const activityPanel = showActivity && <ActivityPanel open={activityOpen} onOpenChange={setActivityOpen} />;

  if (state.kind === "connected") {
    return (
      <div className="flex flex-col gap-1 px-1 text-sm">
        <div className="flex items-center gap-1">
          <BotIcon className="h-4 w-4" />
          <span className="truncate">{t("assistant.status.connected", { client: state.client?.name ?? t("assistant.approval.unknownClient") })}</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={disconnect}>
            {t("assistant.status.disconnect")}
          </Button>
          {activityButton}
        </div>
        {activityPanel}
      </div>
    );
  }

  const message =
    state.kind === "taken-over"
      ? t("assistant.status.takenOver")
      : state.kind === "mismatch"
        ? state.action === "reload-studio"
          ? t("assistant.status.mismatchReload")
          : t("assistant.status.mismatchUpdate")
        : state.kind === "failed"
          ? state.reason === "unreachable"
            ? t("assistant.status.failed", { port })
            : t("assistant.status.closed")
          : state.kind === "connecting"
            ? t("assistant.status.connecting", { port: state.port })
            : null;

  return (
    <div className="flex flex-col gap-1 px-1">
      {message && (
        <p className="text-xs text-muted-foreground">
          <RichText text={message} />
        </p>
      )}
      {state.kind === "mismatch" && state.action === "reload-studio" && (
        <Button size="sm" variant="outline" onClick={() => location.reload()}>
          {t("assistant.status.reload")}
        </Button>
      )}
      {activityButton}
      {activityPanel}
      {state.kind !== "connecting" && state.kind !== "awaiting-approval" && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <BotIcon className="h-4 w-4" />
              {t("assistant.connect.action")}
            </Button>
          </DialogTrigger>
          <ConnectDialog close={() => setOpen(false)} />
        </Dialog>
      )}
    </div>
  );
}
