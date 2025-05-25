import { ChainValue } from "@signumjs/util";
import { useMemo } from "react";
import { cn } from "@/lib/utils.ts";

interface Props {
  suffix?: string;
  amount: string | number;
  decimals?: number;
  cutoff?: number;
  isAtomic?: boolean;
  className?: string;
}

export function Amount({
  amount,
  suffix = "SIGNA",
  decimals = 8,
  cutoff = 4,
  isAtomic,
  className,
}: Props) {
  const value = useMemo(() => {
    const v = ChainValue.create(decimals);
    return isAtomic
      ? v.setAtomic(amount).getCompound()
      : v.setCompound(amount).getCompound();
  }, [decimals, isAtomic, cutoff]);
  return (
    <div className="flex flex-row items-baseline gap-x-0.5">
      <span className={cn("font-medium text-lg", className)}>
        {new Intl.NumberFormat(navigator.language, {
          maximumFractionDigits: cutoff,
        }).format(parseFloat(value))}
      </span>
      <small className="text-xs opacity-70">{suffix?.toUpperCase()}</small>
    </div>
  );
}
