import { GripVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The knob on a resize divider. Every divider in the app draws this one, so
 * the sidebar edge and the panel splits read as the same control. The divider
 * itself supplies the line and the `group/grip` hover target.
 */
export function ResizeGrip({ className }: { className?: string }) {
  return (
    <span
      data-slot="resize-grip"
      aria-hidden
      className={cn(
        "z-10 flex h-4 w-3 items-center justify-center border border-[var(--border-2)] bg-[var(--bg2)] text-[var(--dim)] transition-colors group-hover/grip:border-[var(--accent-2)] group-hover/grip:text-[var(--accent-2)]",
        className,
      )}
    >
      <GripVerticalIcon className="size-2.5" />
    </span>
  );
}
