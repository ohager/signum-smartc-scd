import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n/runtime";
import { effectiveKind, resolveChoice, type NetworkChoice, type NetworkKind } from "../model/network-choice";
import { nodeHostOf } from "../model/networks";
import { useWalletNode } from "./use-network-choice";

/**
 * Mainnet, testnet, the local testnet, the wallet's node or a custom one. The
 * node URL is always on screen; only a custom node can be edited.
 */
export function NetworkPicker({ value, onChange }: { value: NetworkChoice; onChange: (c: NetworkChoice) => void }) {
  const wallet = useWalletNode();
  const kind = effectiveKind(value, wallet);
  const node = nodeHostOf(resolveChoice(value, wallet));
  return (
    <div className="flex flex-col gap-2">
      <Select value={kind} onValueChange={(k) => onChange({ ...value, kind: k as NetworkKind })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mainnet">{t("inspector.network.mainnet")}</SelectItem>
          <SelectItem value="testnet">{t("inspector.network.testnet")}</SelectItem>
          <SelectItem value="local">{t("inspector.network.local")}</SelectItem>
          <SelectItem value="wallet" disabled={!wallet}>
            {wallet ? t("inspector.network.wallet") : t("inspector.network.walletOffline")}
          </SelectItem>
          <SelectItem value="custom">{t("inspector.network.custom")}</SelectItem>
        </SelectContent>
      </Select>
      {kind === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            aria-label={t("inspector.add.customNode")}
            className="font-mono text-xs"
            value={value.custom.node}
            onChange={(e) => onChange({ ...value, custom: { ...value.custom, node: e.target.value } })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs">
            <Checkbox
              checked={!!value.custom.testnet}
              onCheckedChange={(c) => onChange({ ...value, custom: { ...value.custom, testnet: c === true || undefined } })}
            />
            {t("inspector.add.customTestnet")}
          </label>
        </div>
      ) : (
        <Input aria-label={t("inspector.add.customNode")} className="font-mono text-xs" value={node} readOnly />
      )}
    </div>
  );
}
