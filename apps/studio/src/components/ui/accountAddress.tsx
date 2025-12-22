import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { type HTMLAttributes, useMemo } from "react";
import { Address } from "@signumjs/core";

export function AccountAddress({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const status = useWalletStatus();

  const address = useMemo(() => {
    if (!status) {
      return "";
    }
    return Address.create(
      status.accountId,
      status.network === "TestNet" ? "TS" : "S",
    ).getReedSolomonAddress(true);
  }, [status]);

  return address ? (
    <div className={`font-mono text-xs break-all ${className}`} {...props}>
      {address}
    </div>
  ) : null;
}
