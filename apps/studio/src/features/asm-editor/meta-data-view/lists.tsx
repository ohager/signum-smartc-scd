import { useMemo, type ReactNode } from "react";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { initialValue } from "./machine-image.ts";

/**
 * The two lists share a row: a dim identifier on the left, the name beside it,
 * the value — where there is one — pushed to the far edge. One shape, so that
 * reading down either list works the same way.
 */
function Row({
  marker,
  name,
  value,
  valueTitle,
}: {
  marker: string;
  name: string;
  value?: string;
  valueTitle?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 px-3 py-0.5 font-mono text-xs hover:bg-[color-mix(in_srgb,var(--accent-1)_8%,transparent)]">
      <span className="min-w-8 shrink-0 text-right text-[var(--dim)]">
        {marker}
      </span>
      <span className="truncate">{name}</span>
      {value && (
        <span className="ml-auto shrink-0 text-[var(--dim)]" title={valueTitle}>
          {value}
        </span>
      )}
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-auto py-1">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="p-3 text-xs text-[var(--dim)]">{children}</p>;
}

export function MemoryMap({ data }: { data: MachineData }) {
  const slots = useMemo(
    () =>
      data.Memory.map((name, slot) => ({
        slot,
        name,
        value: initialValue(data.ByteData, slot),
      })),
    [data],
  );

  if (slots.length === 0) {
    return <Empty>This contract declares no variables.</Empty>;
  }

  return (
    <List>
      {slots.map(({ slot, name, value }) => (
        <Row
          key={slot}
          marker={String(slot)}
          name={name}
          value={value === 0n ? undefined : value.toString()}
          valueTitle={value === 0n ? undefined : `0x${value.toString(16)}`}
        />
      ))}
    </List>
  );
}

export function LabelList({ data }: { data: MachineData }) {
  // The assembler hands these over in the order it met them. Sorted by address
  // they become a map of the code, in the offsets the dump is read in.
  const labels = useMemo(
    () => [...data.Labels].sort((a, b) => a.address - b.address),
    [data],
  );

  if (labels.length === 0) {
    return <Empty>This contract has no jump targets.</Empty>;
  }

  return (
    <List>
      {labels.map(({ label, address }) => (
        <Row
          key={`${label}-${address}`}
          marker={address.toString(16).padStart(4, "0")}
          name={label}
        />
      ))}
    </List>
  );
}
