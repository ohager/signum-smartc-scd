import { useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Amount } from "@/components/ui/amount.tsx";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { pageBudget, type PageKind } from "./machine-image.ts";

type Swatch = { color: string; opacity: number };
type Ribbon = PageKind & Swatch;

// Code and data carry the two accents, the stacks stay grey: what you tune is
// nearly always the code, and two greys apart in weight still read as two
// kinds where they meet in the ribbon.
const PAGE_SWATCHES: Record<string, Swatch> = {
  code: { color: "var(--accent-2)", opacity: 1 },
  data: { color: "var(--accent-3)", opacity: 1 },
  "code stack": { color: "var(--dim)", opacity: 0.7 },
  "user stack": { color: "var(--dim)", opacity: 0.35 },
};

/**
 * The image drawn as the pages it occupies, the last one filled as far as it
 * actually is. The gap before the next page is the gap before the next 0.1
 * SIGNA, which is the only size question worth asking here.
 */
function PageRibbon({ kinds }: { kinds: Ribbon[] }) {
  const total = kinds.reduce((sum, kind) => sum + kind.count, 0);

  return (
    <div>
      <div className="flex h-2 gap-px" aria-hidden>
        {kinds.flatMap((kind) =>
          Array.from({ length: kind.count }, (_, index) => (
            <div
              key={`${kind.label}-${index}`}
              className="relative min-w-[3px] flex-1 border border-[var(--border-2)]"
            >
              <div
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${(index === kind.count - 1 ? kind.lastFill : 1) * 100}%`,
                  background: kind.color,
                  opacity: kind.opacity,
                }}
              />
            </div>
          )),
        )}
        {total === 0 && (
          <div className="flex-1 border border-[var(--border-2)]" />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--dim)]">
        {kinds.map((kind) => (
          <span key={kind.label} className="flex items-center gap-1">
            <span
              aria-hidden
              className="h-[6px] w-[6px] shrink-0"
              style={{
                background: kind.color,
                opacity: kind.count === 0 ? 0.2 : kind.opacity,
              }}
            />
            {kind.label}
            <span className="font-mono text-[var(--text)]">{kind.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[var(--dim)]">{label}</dt>
      <dd className="min-w-0 truncate">{children}</dd>
    </>
  );
}

function HashId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // A browser that withholds the clipboard leaves the id selectable, which
      // is what the button was a shortcut for.
    }
  };

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-mono">{value}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Code hash copied" : "Copy code hash"}
        className="shrink-0 opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
      >
        {copied ? (
          <CheckIcon className="h-3 w-3 text-[var(--green)]" />
        ) : (
          <CopyIcon className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

export function ContractSummary({ data }: { data: MachineData }) {
  const kinds: Ribbon[] = pageBudget(data).map((kind) => ({
    ...kind,
    ...PAGE_SWATCHES[kind.label],
  }));
  const codeBytes = data.ByteCode.length / 2;

  return (
    <header className="shrink-0 space-y-3 border-b border-[var(--border-1)] p-3">
      <div>
        <h2 className="truncate text-sm font-medium">
          {data.PName || (
            <span className="text-[var(--dim)]">Unnamed contract</span>
          )}
        </h2>
        {data.PDescription && (
          <p
            className="line-clamp-2 text-xs text-[var(--dim)]"
            title={data.PDescription}
          >
            {data.PDescription}
          </p>
        )}
      </div>

      <PageRibbon kinds={kinds} />

      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5 text-xs">
        <Fact label="Minimum fee">
          <Amount
            amount={data.MinimumFeeNQT}
            isAtomic
            className="text-xs font-medium"
          />
        </Fact>
        <Fact label="Activation">
          <Amount
            amount={data.PActivationAmount}
            isAtomic
            className="text-xs font-medium"
          />
        </Fact>
        <Fact label="Machine code">
          <span className="font-mono">{codeBytes.toLocaleString()} bytes</span>
        </Fact>
        <Fact label="Code hash">
          <HashId value={data.MachineCodeHashId} />
        </Fact>
      </dl>
    </header>
  );
}
