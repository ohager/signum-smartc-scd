import { SidebarProvider } from "../sidebar";
import { TooltipProvider } from "../tooltip";
import { LeftSidebar } from "./left-sidebar";
import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

export function AppLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="h-screen flex flex-col">
        <TooltipProvider>
          <SidebarProvider>
            <LeftSidebar />
            <Outlet />
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </div>
    </ThemeProvider>
  );
}
