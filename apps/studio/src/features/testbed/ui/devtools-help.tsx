import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/runtime";
import { T } from "@/i18n/T";

/**
 * Explains how to use the main-thread debug run, whose order of operations is
 * not guessable — DevTools has to be open before the run starts.
 *
 * No TooltipProvider here: `Tooltip` in components/ui/tooltip.tsx already wraps
 * one of its own.
 */
export function DevToolsHelp() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={t("testbed.devtools.label")} className="shrink-0">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-xs">
        <p className="font-medium">{t("testbed.devtools.title")}</p>
        <ol className="list-inside list-decimal space-y-0.5">
          <li>{t("testbed.devtools.openFirst")}</li>
          <li>{t("testbed.devtools.tick")}</li>
          <li>
            <T k="testbed.devtools.find" components={{ code: <code /> }} />
          </li>
          <li>
            <T k="testbed.devtools.breakpoint" components={{ code: <code /> }} />
          </li>
        </ol>
        <p className="text-muted-foreground">
          {t("testbed.devtools.freeze")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
