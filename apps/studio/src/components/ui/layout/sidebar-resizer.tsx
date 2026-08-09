import { useCallback, useRef } from "react";
import { useSidebar } from "@/components/ui/sidebar";

interface Props {
  /** Called once on drag end with the final width (e.g. "320px"). */
  onCommit: (width: string) => void;
  min?: number;
  max?: number;
}

/**
 * Draggable vertical handle at the sidebar's right edge. To stay smooth it
 * mutates the `--sidebar-width` CSS variable directly on the sidebar wrapper
 * during the drag (no React re-render, no localStorage writes) and only commits
 * to React state on mouse-up. The handle tracks the same variable, so it follows
 * the drag purely via CSS. Hidden when collapsed or on mobile.
 */
export function SidebarResizer({ onCommit, min = 180, max = 520 }: Props) {
  const { state, isMobile } = useSidebar();
  const ref = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const wrapper = ref.current?.closest(
        '[data-slot="sidebar-wrapper"]',
      ) as HTMLElement | null;
      let latest = min;
      let frame = 0;

      const onMove = (ev: MouseEvent) => {
        latest = Math.min(Math.max(ev.clientX, min), max);
        if (frame) return; // throttle DOM writes to one per animation frame
        frame = requestAnimationFrame(() => {
          frame = 0;
          wrapper?.style.setProperty("--sidebar-width", `${latest}px`);
        });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (frame) cancelAnimationFrame(frame);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        wrapper?.style.setProperty("--sidebar-width", `${latest}px`);
        onCommit(`${latest}px`); // single React update + persist
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onCommit, min, max],
  );

  if (isMobile || state !== "expanded") return null;

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      style={{ left: "var(--sidebar-width)" }}
      className="fixed inset-y-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-blue-500/40"
      title="Drag to resize sidebar"
    />
  );
}
