import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { NewProjectDialog } from "@/features/project/new-project-dialog";
import { UploadIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { RegisterMark } from "@/components/brand/register-mark";
import { t } from "@/i18n/runtime";

interface Props {
  variant: "full" | "band";
  onImportClick: () => void;
}

export function Hero({ variant, onImportClick }: Props) {
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);

  const createLabel = variant === "full" ? t("home.hero.createFirst") : t("home.hero.newProject");
  const importLabel = variant === "full" ? t("home.hero.importProject") : t("home.hero.import");

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
          <RegisterMark size={20} />
          <h1 className="text-sm font-semibold tracking-tight">
            SmartC{" "}
            <span className="bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] bg-clip-text text-transparent">
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
        <div className="absolute left-1/2 top-[-6rem] h-72 w-[42rem] max-w-[120%] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--accent-1)_22%,transparent)] blur-[110px]" />
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      </div>

      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        {/* i18n-ignore — product name */}
        <RegisterMark size={56} animate label="SmartC Studio" />

        <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-100 duration-700 mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {t("home.hero.tagline")}
        </p>

        <h1 className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-150 duration-700 mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          SmartC{" "}
          <span className="bg-gradient-to-r from-[var(--accent-1)] to-[var(--accent-2)] bg-clip-text text-transparent">
            Studio
          </span>
        </h1>

        <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-200 duration-700 mt-5 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground">
          {t("home.hero.pitch")}
        </p>

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both delay-300 duration-700 mt-8">
          {actions}
        </div>
      </div>
    </section>
  );
}
