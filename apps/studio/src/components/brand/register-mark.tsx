import { largeCells, pixelCells, PIXEL_THRESHOLD, type Cell } from "./register-geometry";

interface Props {
  /** Rendered size in pixels. At 16 and below the gapless pixel version is drawn. */
  size: number;
  /** Build the S cell by cell, in pen order, once. */
  animate?: boolean;
  /** Accessible name; without one the mark is decorative. */
  label?: string;
  className?: string;
}

const FILL: Record<Cell["kind"], string> = {
  ghost: "none",
  lit: "var(--accent-1)",
  end: "var(--accent-2)",
};

/** Studio's mark, in the colours of the active climate. */
export function RegisterMark({ size, animate, label, className }: Props) {
  const pixel = size <= PIXEL_THRESHOLD;
  const cells = pixel ? pixelCells(size) : largeCells();
  const box = pixel ? size : 64;

  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering={pixel ? "crispEdges" : undefined}
      className={[animate ? "register-build" : "", className ?? ""].join(" ").trim() || undefined}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {cells.map((cell, i) => (
        <rect
          key={i}
          data-cell={cell.kind}
          className={cell.kind === "ghost" ? undefined : "rg-cell"}
          x={cell.x}
          y={cell.y}
          width={cell.size}
          height={cell.size}
          fill={FILL[cell.kind]}
          stroke={cell.kind === "ghost" ? "var(--border-2)" : undefined}
          strokeWidth={cell.kind === "ghost" ? 1 : undefined}
          style={cell.order !== undefined ? ({ "--i": cell.order } as React.CSSProperties) : undefined}
        />
      ))}
    </svg>
  );
}
