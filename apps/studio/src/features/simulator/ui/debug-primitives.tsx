import type { ReactNode } from "react";

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "error" }) {
  const cls =
    tone === "accent"
      ? "bg-primary text-primary-foreground border-transparent"
      : tone === "error"
        ? "bg-red-600 text-white border-transparent"
        : "text-muted-foreground";
  return <span className={"text-[10px] px-2 py-0.5 rounded-full border " + cls}>{children}</span>;
}

export function Section({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <div className="px-3 py-2 border-b">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        {count !== undefined && (
          <span className="text-[10px] px-1.5 rounded bg-muted text-foreground font-semibold">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function KVTable({ rows }: { rows: { k: string; v: string; muted?: boolean }[] }) {
  if (rows.length === 0) return <div className="opacity-50 text-xs font-mono">— none —</div>;
  return (
    <table className="w-full border-collapse text-[11px] font-mono">
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.k + i} className={i % 2 ? "bg-muted/40" : ""}>
            <td className={"px-1.5 py-0.5 " + (r.muted ? "opacity-60" : "")}>{r.k}</td>
            <td className="px-1.5 py-0.5 text-right">{r.v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
