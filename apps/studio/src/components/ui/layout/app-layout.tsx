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

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col">
      <TooltipProvider>
        <SidebarProvider>
          {/* <Header /> */}
          <LeftSidebar />
          <Outlet />
        </SidebarProvider>
      </TooltipProvider>
      {/* <Footer /> */}
    </div>
  );
}
