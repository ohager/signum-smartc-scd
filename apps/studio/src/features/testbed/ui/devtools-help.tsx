import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
        <button type="button" aria-label="How to debug with DevTools" className="shrink-0">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-xs">
        <p className="font-medium">Debugging with DevTools</p>
        <ol className="list-inside list-decimal space-y-0.5">
          <li>Open DevTools first — it cannot attach to a run already underway.</li>
          <li>Tick this box, then press Run.</li>
          <li>
            Find your test in Sources under its project path, e.g.{" "}
            <code>/my-project/tests/counter.test.ts</code>.
          </li>
          <li>
            Set a breakpoint there, or put a <code>debugger;</code> statement in the test.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Tests run in the page instead of a worker, so a contract that loops forever will freeze
          the tab — the watchdog cannot interrupt the loop that is blocking it.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
