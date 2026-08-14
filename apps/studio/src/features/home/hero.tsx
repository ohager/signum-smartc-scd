import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { NewProjectDialog } from "@/features/project/new-project-dialog";
import { UploadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

const PITCH =
  "Write, simulate and deploy Signum smart contracts — entirely in your browser. Nothing to install.";

interface Props {
  variant: "full" | "band";
  onImportClick: () => void;
}

/**
 * The `◈` mark from the design sketches, drawn rather than imported: an inline
 * SVG stays crisp at any size, inherits the Signum gradient in both themes and
 * costs no asset request.
 */
function SignumMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id="signum-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-signum-blue)" />
          <stop offset="100%" stopColor="var(--color-signum-lightblue)" />
        </linearGradient>
      </defs>
      <path d="M16 1.5 30.5 16 16 30.5 1.5 16Z" fill="url(#signum-mark)" opacity="0.18" />
      <path
        d="M16 1.5 30.5 16 16 30.5 1.5 16Z"
        fill="none"
        stroke="url(#signum-mark)"
        strokeWidth="1.5"
      />
      <path d="M16 9.5 22.5 16 16 22.5 9.5 16Z" fill="url(#signum-mark)" />
    </svg>
  );
}

export function Hero({ variant, onImportClick }: Props) {
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);

  const createLabel = variant === "full" ? "Create your first contract" : "New Project";
  const importLabel = variant === "full" ? "Import project" : "Import";

  const actions = (
    <div className="flex items-center gap-2">
      <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
        <DialogTrigger asChild>
          <Button variant="accent" size={variant === "full" ? "lg" : "sm"}>
            <PlusIcon className="h-4 w-4" />
            {createLabel}
          </Button>
        </DialogTrigger>
        <NewProjectDialog close={() => setIsNewProjectOpen(false)} />
      </Dialog>
      <Button
        variant="outline"
        size={variant === "full" ? "lg" : "sm"}
        onClick={onImportClick}
      >
        <UploadIcon className="h-4 w-4" />
        {importLabel}
      </Button>
    </div>
  );

  if (variant === "band") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-2.5">
          <SignumMark className="h-5 w-5" />
          <h1 className="text-sm font-semibold tracking-tight">
            SmartC{" "}
            <span className="bg-gradient-to-r from-signum-blue to-signum-lightblue bg-clip-text text-transparent">
              Studio
            </span>
          </h1>
        </div>
        {actions}
      </section>
    );
  }

  return (
    <section className="relative isolate overflow-hidden px-6 py-16 sm:py-24">
      {/* Atmosphere: an accent glow over a hairline grid that fades out downward. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-6rem] h-72 w-[42rem] max-w-[120%] -translate-x-1/2 rounded-full bg-signum-blue/25 blur-[110px] dark:bg-signum-lightblue/20" />
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      </div>

      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="animate-in fade-in zoom-in-95 fill-mode-both duration-700">
          <SignumMark className="h-14 w-14" />
        </div>

        <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-100 duration-700 mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Signum · Browser IDE
        </p>

        <h1 className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-150 duration-700 mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          SmartC{" "}
          <span className="bg-gradient-to-r from-signum-blue to-signum-lightblue bg-clip-text text-transparent">
            Studio
          </span>
        </h1>

        <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-200 duration-700 mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground">
          {PITCH}
        </p>

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-300 duration-700 mt-8">
          {actions}
        </div>
      </div>
    </section>
  );
}
