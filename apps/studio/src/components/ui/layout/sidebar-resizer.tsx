import { useCallback } from "react";
import { useSidebar } from "@/components/ui/sidebar";

interface Props {
  width: string;
  onChange: (width: string) => void;
  min?: number;
  max?: number;
}

/**
 * A draggable vertical handle sitting at the sidebar's right edge. Dragging
 * updates the sidebar width (px). Hidden when the sidebar is collapsed or on
 * mobile (where the sidebar is an overlay).
 */
export function SidebarResizer({ width, onChange, min = 180, max = 520 }: Props) {
  const { state, isMobile } = useSidebar();

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onMove = (ev: MouseEvent) => {
        const w = Math.min(Math.max(ev.clientX, min), max);
        onChange(`${w}px`);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onChange, min, max],
  );

  if (isMobile || state !== "expanded") return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      style={{ left: width }}
      className="fixed inset-y-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-blue-500/40"
      title="Drag to resize sidebar"
    />
  );
}
