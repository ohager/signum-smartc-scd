import { OutputFileType } from "typescript";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../resizable";
import { SidebarProvider } from "../sidebar";
import { TooltipProvider } from "../tooltip";
import { Header } from "./header";
import { LeftSidebar } from "./left-sidebar";
import { Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { getSystemTheme } from "@/lib/get-system-theme";

// const systemTheme = getSystemTheme();

export function AppLayout() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="h-screen flex flex-col">
        <TooltipProvider>
          <SidebarProvider>
            {/* <Header /> */}
            <LeftSidebar />
            <Outlet />
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
        {/* <Footer /> */}
      </div>
    </ThemeProvider>
  );
}
