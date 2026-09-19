import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The two kinds of surface in Studio.
 *
 * `hairline` is the working surface: a 1px box and nothing else, because the
 * dense views cannot afford decoration. `bracketed` is for home, dialogs and
 * empty states — the places people arrive at rather than work in. Its corner
 * brackets are the one decorative gesture the language allows, taken from
 * signum-sandbox: 14px, 2px, top-left and bottom-right only.
 */
export function Panel({
  variant = "hairline",
  className,
  children,
}: {
  variant?: "hairline" | "bracketed";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative border border-[var(--border-2)]",
        variant === "bracketed" && "bg-[var(--panel)] backdrop-blur-[8px]",
        className,
      )}
    >
      {variant === "bracketed" && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-px -top-px h-[14px] w-[14px] border-l-2 border-t-2 border-[var(--accent-2)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-px -right-px h-[14px] w-[14px] border-b-2 border-r-2 border-[var(--accent-2)]"
          />
        </>
      )}
      {children}
    </div>
  );
}
