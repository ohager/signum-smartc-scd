import { ChainValue } from "@signumjs/util";
import { useMemo } from "react";
import { cn } from "@/lib/utils.ts";

interface Props {
  suffix?: string;
  amount: string | number;
  decimals?: number;
  isAtomic?: boolean;
  className?: string;
}

export function Amount({
  amount,
  suffix = "SIGNA",
  decimals = 8,
  isAtomic,
  className,
}: Props) {
  const value = useMemo(() => ChainValue.create(decimals), [decimals]);

  return (
    <div className="flex flex-row items-baseline gap-x-0.5">
      <span className={cn("font-medium text-lg", className)}>
        {isAtomic
          ? value.setAtomic(amount).getCompound()
          : value.setCompound(amount).getCompound()}
      </span>
      <small className="text-xs opacity-70">{suffix?.toUpperCase()}</small>
    </div>
  );
}
