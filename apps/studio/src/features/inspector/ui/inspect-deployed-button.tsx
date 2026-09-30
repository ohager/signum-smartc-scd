import { useState } from "react";
import { useNavigate } from "react-router";
import { ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { t } from "@/i18n/runtime";
import { networkFromWallet } from "../model/networks";
import { inspectDeployed } from "../workspace/inspect-deployed";

export function InspectDeployedButton({
  projectFolderId,
  sourceFileId,
  contractId,
}: {
  projectFolderId: string;
  sourceFileId: string;
  contractId: string;
}) {
  const fs = useFileSystem();
  const wallet = useWalletStatus();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy || !wallet}
      title={t("inspector.deploy.inspectHint")}
      onClick={async () => {
        if (!wallet) return;
        setBusy(true);
        try {
          const { watchlistId } = await inspectDeployed(fs, {
            projectFolderId,
            sourceFileId,
            contractId,
            network: networkFromWallet(wallet.network),
          });
          navigate(`/projects/${projectFolderId}/files/${watchlistId}?contract=${contractId}`);
        } catch (e) {
          toast.error(t("inspector.deploy.failed", { message: (e as Error).message }));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ScanSearch className="h-4 w-4" /> {t("inspector.deploy.inspect")}
    </Button>
  );
}
