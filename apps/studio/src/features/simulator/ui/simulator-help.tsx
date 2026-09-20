import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * How this thing works, in four sentences.
 *
 * The model is not guessable from the controls: the chain is invented, blocks
 * do not arrive on their own, and the transactions come from a file. Written
 * once, shown twice — as the empty state's invitation, and behind the `?` once
 * the empty state is gone.
 */
export const SIMULATOR_MODEL = [
  "Your contract runs here in an invented Signum chain.",
  "A scenario supplies the transactions that poke it.",
  "Blocks only exist when you forge them — that is what “Next block” does.",
  "Set breakpoints in the margin; “Step” advances one source line.",
];

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
          aria-label="How the simulator works"
          className="shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
        >
          <HelpCircle className="h-4 w-4 text-[var(--dim)] hover:text-[var(--text)]" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-xs">
        <p className="font-medium">How the simulator works</p>
        <ul className="space-y-0.5">
          {SIMULATOR_MODEL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
