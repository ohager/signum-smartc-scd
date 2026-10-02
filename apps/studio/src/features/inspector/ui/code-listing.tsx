import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";
import { AsmOpcodes } from "@/features/asm-editor/code-editor/language-definitions/opcodes";
import { formatValue, slotToBigInt } from "../model/decode";
import type { DisassemblyView } from "./use-disassembly";
import type { CodeSelection } from "./code-detail";
import type { LabelMap } from "../model/label-map";
import { slotTrust, targetTrust } from "../disasm/trust";
import { TrustBadge } from "./trust-badge";
import { ROW_HOVER, ROW_SELECTED } from "./selection";

const hex4 = (n: number) => n.toString(16).padStart(4, "0");

export function CodeListing({
  view,
  machineData,
  prefix,
  enums,
  selection,
  highlight,
  showBytes,
  showValues,
  scrollTo,
  onSelect,
  map,
  codeHash,
}: {
  view: DisassemblyView;
  machineData: string;
  prefix: "S" | "TS";
  enums: Record<string, Record<string, string>>;
  selection: CodeSelection | null;
  /** Instruction addresses to mark, e.g. the writers of a slot. */
  highlight: Set<number>;
  showBytes: boolean;
  showValues: boolean;
  scrollTo: { address: number; nonce: number } | null;
  onSelect: (selection: CodeSelection) => void;
  map: LabelMap | null;
  codeHash: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollTo) return;
    container.current?.querySelector(`[data-address="${scrollTo.address}"]`)?.scrollIntoView({ block: "center" });
  }, [scrollTo]);

  const { dis, names, outline } = view;
  const slotValue = (index: number) => {
    const hex = machineData.slice(index * 16, index * 16 + 16);
    if (hex.length < 16) return null;
    const label = names.slotLabel[index];
    return formatValue(slotToBigInt(hex), label?.format ?? "long", { prefix, enums, enumName: label?.enum });
  };

  return (
    <div ref={container} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
      {dis.rows.map((row) => {
        if (row.kind === "padding") {
          return (
            <div key={`p${row.address}`} className="px-3 py-1 text-muted-foreground">
              {hex4(row.address)} · {t("inspector.code.padding", { count: row.size })}
            </div>
          );
        }
        if (row.kind === "unknown") {
          return (
            <div key={`u${row.address}`} className="px-3 py-0.5 text-[var(--amber)]">
              {hex4(row.address)} {t("inspector.code.unknown", { byte: row.bytes, reason: reasonText(row.reason) })}
            </div>
          );
        }
        const selected =
          (selection?.kind === "instruction" || selection?.kind === "target") && selection.address === row.address;
        const label = names.targetAsm.has(row.address) ? names.targetDisplay.get(row.address) : null;
        const doc = AsmOpcodes[row.form.mnemonic];
        return (
          <div key={row.address} data-address={row.address}>
            {outline.blockStarts.has(row.address) && row.address !== 0 && <div className="mx-3 border-t border-dashed" />}
            {label && (
              <button
                type="button"
                className="block px-3 pt-1 text-left text-[var(--accent-2)]"
                onClick={() => onSelect({ kind: "target", address: row.address })}
              >
                {label}: <Mark trust={targetTrust(names, row.address, map, codeHash)} />
              </button>
            )}
            <div
              className={cn(
                "flex cursor-pointer gap-3 px-3 py-0.5",
                ROW_HOVER,
                selected && ROW_SELECTED,
                highlight.has(row.address) && !selected && "bg-[color-mix(in_srgb,var(--accent-2)_10%,transparent)]",
              )}
              onClick={() => onSelect({ kind: "instruction", address: row.address })}
            >
              <span className="w-10 shrink-0 text-muted-foreground">{hex4(row.address)}</span>
              {showBytes && <span className="w-56 shrink-0 truncate text-muted-foreground">{row.bytes}</span>}
              <span title={doc ? `${doc.title} · ${t("inspector.code.steps", { steps: doc.stepFee })}` : undefined} className="w-10 shrink-0 font-semibold">
                {row.form.mnemonic}
              </span>
              <span className="min-w-0 flex-1">
                {row.form.parts.map((part, k) => {
                  // The mnemonic has its own column; the first literal starts with it.
                  if (typeof part === "string") return <span key={k}>{k === 0 ? part.slice(row.form.mnemonic.length) : part}</span>;
                  const o = row.operands[part]!;
                  if (o.kind === "slot") {
                    const value = showValues ? slotValue(o.index) : null;
                    return (
                      <button
                        key={k}
                        type="button"
                        className="underline decoration-dotted"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect({ kind: "slot", index: o.index });
                        }}
                      >
                        {names.slotDisplay[o.index] ?? names.slotAsm[o.index]}
                        <Mark trust={slotTrust(names, o.index, map, codeHash)} />
                        {value !== null && <span className="text-muted-foreground"> ={value}</span>}
                      </button>
                    );
                  }
                  if (o.kind === "target") {
                    return (
                      <button
                        key={k}
                        type="button"
                        className="text-[var(--accent-2)] underline decoration-dotted"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect({ kind: "target", address: o.address });
                        }}
                      >
                        {names.targetDisplay.get(o.address)}
                        <Mark trust={targetTrust(names, o.address, map, codeHash)} />
                      </button>
                    );
                  }
                  return <span key={k}>{o.kind === "const" ? o.value.toString(16).padStart(16, "0") : o.name}</span>;
                })}
              </span>
              {dis.misaligned.includes(row.address) && <span className="text-[var(--amber)]">{t("inspector.code.misaligned")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function reasonText(reason: "opcode" | "api" | "slot" | "truncated"): string {
  switch (reason) {
    case "opcode":
      return t("inspector.code.reason.opcode");
    case "api":
      return t("inspector.code.reason.api");
    case "slot":
      return t("inspector.code.reason.slot");
    case "truncated":
      return t("inspector.code.reason.truncated");
  }
}

/** Every name shown carries its trust; a generated name (`var_007`, `lab_01a4`) has none to show. */
function Mark({ trust }: { trust: ReturnType<typeof slotTrust> }) {
  return trust ? <span className="ml-0.5"><TrustBadge trust={trust} /></span> : null;
}
