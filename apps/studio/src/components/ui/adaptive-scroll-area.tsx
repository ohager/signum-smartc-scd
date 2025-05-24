import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import {
  type ComponentProps,
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";

interface Props extends PropsWithChildren {
  yOffsetPixel?: number;
}

export function AdaptiveScrollArea({
  children,
  yOffsetPixel = 30,
  ...props
}: Props & ComponentProps<typeof ScrollArea>) {
  const [editorHeight, setEditorHeight] = useState("100vh");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateEditorHeight = () => {
      if (containerRef.current) {
        const containerTop = containerRef.current.getBoundingClientRect().top;
        setEditorHeight(`calc(100vh - ${containerTop + yOffsetPixel}px)`);
      }
    };

    calculateEditorHeight();
    window.addEventListener("resize", calculateEditorHeight);
    return () => {
      window.removeEventListener("resize", calculateEditorHeight);
    };
  }, [yOffsetPixel]);

  return (
    <ScrollArea {...props} ref={containerRef} style={{ height: editorHeight }}>
      {children}
    </ScrollArea>
  );
}
