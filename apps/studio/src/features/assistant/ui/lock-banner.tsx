import { BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/runtime";
import { useAssistant } from "../bridge/use-assistant";

/* Shown above every editor of a project while an agent works on it. */
export function LockBanner({ projectId }: { projectId: string }) {
  const { takeOver } = useAssistant();
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg2)] px-2.5 py-1 text-xs text-muted-foreground"
    >
      <BotIcon className="h-4 w-4 shrink-0" />
      <span className="truncate">{t("assistant.lock.banner")}</span>
      <div className="ml-auto flex items-center gap-2">
        {/* Task 19: follow switch */}
        <Button size="sm" variant="outline" onClick={() => void takeOver(projectId)}>
          {t("assistant.lock.takeOver")}
        </Button>
      </div>
    </div>
  );
}
