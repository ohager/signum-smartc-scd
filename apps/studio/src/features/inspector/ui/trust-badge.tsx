import { BadgeCheck, CircleHelp, GitBranch } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/runtime";
import type { Trust } from "../disasm/trust";

const ICONS = { verified: BadgeCheck, otherBuild: GitBranch, claim: CircleHelp } as const;

export function trustText(trust: Trust): string {
  switch (trust) {
    case "verified":
      return t("inspector.trust.verified");
    case "otherBuild":
      return t("inspector.trust.otherBuild");
    case "claim":
      return t("inspector.trust.claim");
  }
}

/** A name's provenance at a glance; the tooltip says it in words. */
export function TrustBadge({ trust }: { trust: Trust }) {
  const Icon = ICONS[trust];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={trustText(trust)}
          className={trust === "verified" ? "text-[var(--green)]" : "text-muted-foreground"}
        >
          <Icon className="inline h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{trustText(trust)}</TooltipContent>
    </Tooltip>
  );
}
