import type { PropsWithChildren } from "react";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";

interface Props extends PropsWithChildren {
  identifier: string;
  type: "tx" | "address" | "at" | "asset";
}

const ExplorerUrl = {
  TestNet: "https://t-chain.signum.network",
  MainNet: "https://explorer.signum.network",
};

export function ExplorerLink({ identifier, type, children }: Props) {
  const status = useWalletStatus();

  if (!status) return null;

  const url = `${ExplorerUrl[status?.network]}/${type}/${identifier}`;

  return (
    <a href={url} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
