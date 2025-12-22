import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Button } from "@/components/ui/button.tsx";
import { CrownIcon, FlaskConicalIcon, PlugZapIcon } from "lucide-react";
import { AlertDialog } from "@/components/ui/alert-dialog.tsx";
import { type ComponentProps, useState } from "react";
import type { NetworkType } from "@/types/wallet.types.ts";
import { wallet } from "@/lib/wallet.ts";

export function WalletConnectButton(props: ComponentProps<typeof Button>) {
  const [connectionError, setConnectionError] = useState("");
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [expectedNetwork, setExpectedNetwork] = useState<NetworkType>();

  const connectWallet = async (network: NetworkType) => {
    try {
      setExpectedNetwork(network);
      await wallet.connect(network);
    } catch (e) {
      setShowAlertDialog(true);
      setConnectionError(e.message);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button {...props}>
            <PlugZapIcon className="mr-1" />
            Connect Wallet
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-full">
          <DropdownMenuItem onClick={() => connectWallet("TestNet")}>
            <FlaskConicalIcon className="h-4 w-4" />
            Connect to Testnet
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => connectWallet("MainNet")}>
            <CrownIcon className="h-4 w-4" />
            Connect to Mainnet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={showAlertDialog}
        onOpenChange={setShowAlertDialog}
        title="Connection Issue"
        type="warning"
        description={
          <div>
            {connectionError}
            <div className="border rounded-md p-2 mt-2 text-center">
              Expected Network: {expectedNetwork?.toUpperCase()}
            </div>
          </div>
        }
      />
    </>
  );
}
