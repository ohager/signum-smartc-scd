import { useState } from "react";
import { useAtomValue } from "jotai";
import { BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/runtime";
import { useAssistant } from "../bridge/use-assistant";
import type { ConnectionState } from "../bridge/connection";
import { hasActivity } from "../activity/feed-model";
import { assistantPortAtom, feedAtom } from "../state";
import { ActivityPanel } from "./activity-panel";
import { ConnectDialog } from "./connect-dialog";
import { RichText } from "./rich-text";
import { useAgentActive } from "./use-agent-active";

/* The dot says how the connection stands at a glance; the menu says why. */
function dotColor(state: ConnectionState): string | null {
  switch (state.kind) {
    case "connected":
      return "var(--green)";
    case "connecting":
    case "awaiting-approval":
      return "var(--accent-2)";
    case "failed":
    case "mismatch":
    case "taken-over":
      return "var(--mag)";
    default:
      return null;
  }
}

function statusMessage(state: ConnectionState, port: number, working: boolean): string | null {
  switch (state.kind) {
    case "connected": {
      const client = state.client?.name ?? t("assistant.approval.unknownClient");
      return working ? t("assistant.status.working", { client }) : t("assistant.status.connected", { client });
    }
    case "taken-over":
      return t("assistant.status.takenOver");
    case "mismatch":
      return state.action === "reload-studio" ? t("assistant.status.mismatchReload") : t("assistant.status.mismatchUpdate");
    case "failed":
      return state.reason === "unreachable" ? t("assistant.status.failed", { port }) : t("assistant.status.closed");
    case "connecting":
      return t("assistant.status.connecting", { port: state.port });
    default:
      return null;
  }
}

/*
 * Header entry: a bot icon whose dot carries the connection state, and a menu with the
 * explanation and whatever can be done about it. It is app-wide, not a verb of the page
 * it sits on, which is why the header renders it itself rather than a feature pushing it in.
 * While the agent works, the icon pulses and the dot pings, so its activity shows from any
 * page; with reduced motion only the colour remains.
 */
export function AssistantStatus() {
  const { state, disconnect } = useAssistant();
  const port = useAtomValue(assistantPortAtom);
  const feed = useAtomValue(feedAtom);
  const working = useAgentActive(state.kind === "connected");
  const [connectOpen, setConnectOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const message = statusMessage(state, port, working);
  const dot = dotColor(state);
  const busy = state.kind === "connecting" || state.kind === "awaiting-approval";
  /* The feed outlives the connection, so Restore stays reachable until there is nothing to show. */
  const showActivity = hasActivity(feed);
  const label = message ?? t("assistant.connect.action");

  return (
    <>
      <DropdownMenu>
        <Tooltip delayDuration={500}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative shrink-0" aria-label={label}>
                <BotIcon
                  className={"size-5" + (working ? " motion-safe:animate-pulse" : "")}
                  style={working ? { color: "var(--green)" } : undefined}
                />
                {dot && working && (
                  <span
                    aria-hidden
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full opacity-75 motion-safe:animate-ping"
                    style={{ background: dot }}
                  />
                )}
                {dot && (
                  <span
                    aria-hidden
                    className={"absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-background" + (busy ? " animate-pulse" : "")}
                    style={{ background: dot }}
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{label}</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-72">
          {message && (
            <>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                <RichText text={message} />
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {state.kind === "mismatch" && state.action === "reload-studio" && (
            <DropdownMenuItem onSelect={() => location.reload()}>{t("assistant.status.reload")}</DropdownMenuItem>
          )}
          {showActivity && (
            <DropdownMenuItem onSelect={() => setActivityOpen(true)}>{t("assistant.status.activity")}</DropdownMenuItem>
          )}
          {/* A relay that never answers must not leave the user waiting without a way out. */}
          {busy && <DropdownMenuItem onSelect={disconnect}>{t("assistant.status.cancel")}</DropdownMenuItem>}
          {state.kind === "connected" && (
            <DropdownMenuItem onSelect={disconnect}>{t("assistant.status.disconnect")}</DropdownMenuItem>
          )}
          {state.kind !== "connected" && !busy && (
            <DropdownMenuItem onSelect={() => setConnectOpen(true)}>
              <BotIcon className="h-4 w-4" />
              {t("assistant.connect.action")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu: it unmounts its content on close, and these must outlive it. */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <ConnectDialog close={() => setConnectOpen(false)} />
      </Dialog>
      {showActivity && <ActivityPanel open={activityOpen} onOpenChange={setActivityOpen} />}
    </>
  );
}
