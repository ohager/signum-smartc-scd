import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Panel } from "@/components/ui/panel.tsx";
import { ToolbarButton } from "@/components/ui/surface-toolbar.tsx";
import { t } from "@/i18n/runtime";

/**
 * How this thing works, in four sentences.
 *
 * The model is not guessable from the controls: the chain is invented, blocks
 * do not arrive on their own, and the transactions come from a file. Written
 * once, shown twice — as the empty state's invitation, and behind the `?` once
 * the empty state is gone.
 */
export const SIMULATOR_MODEL = [
  "simulator.help.model.chain",
  "simulator.help.model.scenario",
  "simulator.help.model.blocks",
  "simulator.help.model.breakpoints",
] as const;

/**
 * The same trigger shape as `testbed/ui/devtools-help.tsx`, so the two helps in
 * this application behave identically.
 */
export function SimulatorHelp() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("simulator.help.title")}
          className="shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          <HelpCircle className="h-4 w-4 text-[var(--dim)] hover:text-[var(--text)]" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-xs">
        <p className="font-medium">{t("simulator.help.title")}</p>
        <ul className="space-y-0.5">
          {SIMULATOR_MODEL.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * What a project with no scenario sees first.
 *
 * Not a barrier: `DebugView` falls back to a built-in default scenario, and a
 * newcomer who just wants to watch the contract run should not have to author
 * a file to do it. So the invitation explains the model and offers both — make
 * one, or step through the default.
 */
export function SimulatorInvitation({
  onCreate,
  onUseDefault,
}: {
  onCreate?: () => void;
  onUseDefault: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Panel variant="bracketed" className="max-w-[460px] p-5">
        <h2 className="mb-2 text-sm font-medium">{t("simulator.help.noScenario")}</h2>
        <ul className="mb-4 space-y-1.5 text-xs text-[var(--dim)]">
          {SIMULATOR_MODEL.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          {onCreate && (
            <ToolbarButton weight="primary" onClick={onCreate}>
              {t("simulator.help.createFirst")}
            </ToolbarButton>
          )}
          <ToolbarButton onClick={onUseDefault}>
            {t("simulator.help.useDefault")}
          </ToolbarButton>
        </div>
      </Panel>
    </div>
  );
}
