import { SidebarProvider } from "../sidebar";
import { TooltipProvider } from "../tooltip";
import { LeftSidebar } from "./left-sidebar";
import { SidebarResizer } from "./sidebar-resizer";
import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { useEffect, useState, type CSSProperties } from "react";

const SIDEBAR_WIDTH_KEY = "sidebar-width";

export function AppLayout() {
  const [sidebarWidth, setSidebarWidth] = useState<string>(
    () => (typeof window !== "undefined" && localStorage.getItem(SIDEBAR_WIDTH_KEY)) || "16rem",
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth);
  }, [sidebarWidth]);

  return (
    <div className="h-screen flex flex-col">
      <TooltipProvider>
        <SidebarProvider style={{ "--sidebar-width": sidebarWidth } as CSSProperties}>
          <LeftSidebar />
          <SidebarResizer onCommit={setSidebarWidth} />
          <Outlet />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </div>
  );
}
