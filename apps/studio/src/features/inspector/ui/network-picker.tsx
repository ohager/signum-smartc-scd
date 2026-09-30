import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n/runtime";
import type { Network } from "../model/networks";

export function NetworkPicker({ value, onChange }: { value: Network; onChange: (n: Network) => void }) {
  const kind = typeof value === "string" ? value : "custom";
  return (
    <div className="flex flex-col gap-2">
      <Select
        value={kind}
        onValueChange={(k) => onChange(k === "custom" ? { node: "https://" } : (k as "mainnet" | "testnet"))}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="mainnet">{t("inspector.network.mainnet")}</SelectItem>
          <SelectItem value="testnet">{t("inspector.network.testnet")}</SelectItem>
          <SelectItem value="custom">{t("inspector.network.custom")}</SelectItem>
        </SelectContent>
      </Select>
      {typeof value === "object" && (
        <div className="flex items-center gap-2">
          <Input
            aria-label={t("inspector.add.customNode")}
            value={value.node}
            onChange={(e) => onChange({ ...value, node: e.target.value })}
          />
          <label className="flex shrink-0 items-center gap-1 text-xs">
            <Checkbox
              checked={!!value.testnet}
              onCheckedChange={(c) => onChange({ ...value, testnet: c === true || undefined })}
            />
            {t("inspector.add.customTestnet")}
          </label>
        </div>
      )}
    </div>
  );
}
