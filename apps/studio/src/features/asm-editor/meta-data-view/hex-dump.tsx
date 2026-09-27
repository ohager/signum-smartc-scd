import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BYTE_GROUP,
  OFFSET_DIGITS,
  largestRowFitting,
} from "./machine-image.ts";

/** How many bytes fit on one line of the panel at its current width. */
function useBytesPerRow(ref: RefObject<HTMLElement | null>) {
  const [bytesPerRow, setBytesPerRow] = useState(BYTE_GROUP);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const charWidth = measureCharWidth(element);
      if (!charWidth) return;
      setBytesPerRow(largestRowFitting(element.clientWidth / charWidth));
    };

    measure();
    // The mono face arrives over the network. Measured before it lands, every
    // row is sized for the fallback.
    document.fonts?.ready.then(measure).catch(() => {});

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return bytesPerRow;
}

// Absolutely positioned, so measuring cannot widen the element being observed.
function measureCharWidth(element: HTMLElement) {
  const probe = document.createElement("span");
  probe.textContent = "0".repeat(100);
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  element.appendChild(probe);
  const width = probe.getBoundingClientRect().width / 100;
  element.removeChild(probe);
  return width;
}

export function HexDump({ hex }: { hex: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const bytesPerRow = useBytesPerRow(ref);
  const bytes = useMemo(() => hex.match(/../g) ?? [], [hex]);

  const rows = useMemo(() => {
    const lines: { offset: number; text: string }[] = [];
    for (let offset = 0; offset < bytes.length; offset += bytesPerRow) {
      const row = bytes.slice(offset, offset + bytesPerRow);
      const groups: string[] = [];
      for (let at = 0; at < row.length; at += BYTE_GROUP) {
        groups.push(row.slice(at, at + BYTE_GROUP).join(" "));
      }
      lines.push({ offset, text: groups.join("  ") });
    }
    return lines;
  }, [bytes, bytesPerRow]);

  return (
    <div
      ref={ref}
      className="relative h-full overflow-auto p-3 font-mono text-xs"
    >
      {rows.length === 0 ? (
        <p className="text-[var(--dim)]">This contract assembles to no code.</p>
      ) : (
        rows.map(({ offset, text }) => (
          <div key={offset} className="whitespace-pre leading-5">
            <span className="text-[var(--dim)]">
              {offset.toString(16).padStart(OFFSET_DIGITS, "0")}
            </span>
            {"  "}
            {text}
          </div>
        ))
      )}
    </div>
  );
}
