import { useState, type ReactNode } from "react";
import { PanelTabs } from "@/components/ui/panel.tsx";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { ContractSummary } from "./contract-summary.tsx";
import { HexDump } from "./hex-dump.tsx";
import { LabelList, MemoryMap } from "./lists.tsx";

interface Props {
  machineData: MachineData;
}

type View = "memory" | "labels" | "bytes";

/**
 * What the assembly became, beside the assembly itself.
 *
 * One column, not two. This panel used to split its width between a metadata
 * card and a tabbed bytecode view, which left each of them half of a side
 * panel — and a hex dump in a quarter of the window is unreadable. The views
 * take turns over the full width instead, and the summary above them stays
 * put, because size, fee and hash are what you glance at while reading code.
 */
export function MetaDataView({ machineData }: Props) {
  const [view, setView] = useState<View>("memory");

  const tabs: { id: View; label: ReactNode }[] = [
    {
      id: "memory",
      label: <Tab name="Memory" count={machineData.Memory.length} />,
    },
    {
      id: "labels",
      label: <Tab name="Labels" count={machineData.Labels.length} />,
    },
    {
      id: "bytes",
      label: <Tab name="Bytes" count={machineData.ByteCode.length / 2} />,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ContractSummary data={machineData} />
      <PanelTabs value={view} onChange={setView} tabs={tabs} />
      <div className="min-h-0 flex-1">
        {view === "memory" && <MemoryMap data={machineData} />}
        {view === "labels" && <LabelList data={machineData} />}
        {view === "bytes" && <HexDump hex={machineData.ByteCode} />}
      </div>
    </div>
  );
}

function Tab({ name, count }: { name: string; count: number }) {
  return (
    <span className="flex items-baseline justify-center gap-1.5">
      {name}
      <span className="font-mono text-[11px] opacity-60">
        {count.toLocaleString()}
      </span>
    </span>
  );
}
