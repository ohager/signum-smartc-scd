import { Button } from "@/components/ui/button";
import { t } from "@/i18n/runtime";
import { formatValue, slotToBigInt } from "../model/decode";
import type { LabelMap } from "../model/label-map";
import { trustOf } from "../disasm/trust";
import { slotUse, type JumpKind } from "../disasm/xrefs";
import { TrustBadge } from "./trust-badge";
import type { DisassemblyView } from "./use-disassembly";

export type CodeSelection =
  | { kind: "instruction"; address: number }
  | { kind: "slot"; index: number }
  | { kind: "target"; address: number };

const hex4 = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;

function jumpKindText(kind: JumpKind): string {
  switch (kind) {
    case "jump":
      return t("inspector.code.jumpKinds.jump");
    case "branch":
      return t("inspector.code.jumpKinds.branch");
    case "call":
      return t("inspector.code.jumpKinds.call");
    case "error":
      return t("inspector.code.jumpKinds.error");
  }
}

function AddressList({ addresses, onGo }: { addresses: number[]; onGo: (a: number) => void }) {
  if (addresses.length === 0) return <span className="text-muted-foreground">{t("inspector.code.none")}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {addresses.map((a) => (
        <button key={a} type="button" className="font-mono underline decoration-dotted" onClick={() => onGo(a)}>
          {hex4(a)}
        </button>
      ))}
    </span>
  );
}

export function CodeDetail({
  view,
  selection,
  map,
  codeHash,
  machineData,
  prefix,
  onGo,
  onLabelSlot,
  onNameLocation,
  onShowInData,
}: {
  view: DisassemblyView;
  selection: CodeSelection | null;
  map: LabelMap | null;
  codeHash: string;
  machineData: string;
  prefix: "S" | "TS";
  onGo: (address: number) => void;
  onLabelSlot: (index: number) => void;
  onNameLocation: (address: number) => void;
  onShowInData: (index: number) => void;
}) {
  if (!selection) return <p className="p-3 text-xs text-muted-foreground">{t("inspector.code.select")}</p>;
  const { names, xrefs, dis } = view;

  if (selection.kind === "slot") {
    const { index } = selection;
    const { reads, writes } = slotUse(xrefs, index);
    const label = names.slotLabel[index];
    const hex = machineData.slice(index * 16, index * 16 + 16);
    const through = xrefs.writesThrough.filter((w) => w.pointer === index).map((w) => w.address);
    return (
      <div className="flex flex-col gap-3 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono">
            #{index} {names.slotDisplay[index] ?? names.slotAsm[index]}{" "}
            {label && map && <TrustBadge trust={trustOf(label.origin, map, codeHash)} />}
          </span>
          <Button size="sm" variant="outline" onClick={() => onLabelSlot(index)}>
            {label ? t("inspector.data.editLabel") : t("inspector.data.setLabel")}
          </Button>
        </div>
        {label?.comment && <p className="text-muted-foreground">{label.comment}</p>}
        {hex.length === 16 && (
          <p>
            {t("inspector.code.currentValue")}:{" "}
            <span className="font-mono">
              {formatValue(slotToBigInt(hex), label?.format ?? "long", { prefix, enums: map?.enums ?? {}, enumName: label?.enum })}
            </span>
          </p>
        )}
        <p>{t("inspector.code.writes")}: <AddressList addresses={writes} onGo={onGo} /></p>
        <p>{t("inspector.code.reads")}: <AddressList addresses={reads} onGo={onGo} /></p>
        {through.length > 0 && (
          <p>
            {t("inspector.code.writesThrough", { name: names.slotDisplay[index] ?? names.slotAsm[index] })}:{" "}
            <AddressList addresses={through} onGo={onGo} />
          </p>
        )}
        <Button size="sm" variant="ghost" className="self-start" onClick={() => onShowInData(index)}>
          {t("inspector.code.showInData")}
        </Button>
      </div>
    );
  }

  const address = selection.address;
  const incoming = xrefs.incoming.get(address) ?? [];
  const codeLabel = names.codeLabel.get(address);
  const instr = dis.instructions.find((i) => i.address === address);
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          {hex4(address)} {names.targetDisplay.get(address) ?? ""}{" "}
          {codeLabel && map && <TrustBadge trust={trustOf(codeLabel.origin, map, codeHash)} />}
        </span>
        <Button size="sm" variant="outline" onClick={() => onNameLocation(address)}>
          {t("inspector.code.nameLocation")}
        </Button>
      </div>
      {instr && <p className="font-mono text-xs text-muted-foreground">{instr.bytes}</p>}
      <div>
        <p>{t("inspector.code.incoming")}:</p>
        {incoming.length === 0 ? (
          <span className="text-muted-foreground">{t("inspector.code.none")}</span>
        ) : (
          <ul>
            {incoming.map((r) => (
              <li key={`${r.from}-${r.kind}`}>
                <button type="button" className="font-mono underline decoration-dotted" onClick={() => onGo(r.from)}>
                  {hex4(r.from)}
                </button>{" "}
                <span className="text-muted-foreground">{jumpKindText(r.kind)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
