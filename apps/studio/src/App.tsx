import "./index.css";
import { AppLayout } from "./components/ui/layout/app-layout";
import { jotaiStore } from "./stores/jotai-store";
import { Provider as JotaiProvider } from "jotai";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "next-themes";
import { FilesPage } from "./pages/files/files-page";
import { DebugDashboardPage } from "./pages/debug/debug-dashboard-page";
import { HomePage } from "./pages/home/home-page";
import { SimulatePage } from "./pages/simulate/simulate-page";
import { useMotion } from "./motion/use-motion";
export function App() {
  useMotion();

  return (
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider
          attribute="data-theme"
          themes={["nexus", "dawn", "solaris", "terminal"]}
          defaultTheme="nexus"
          enableSystem={false}
        >
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/projects/:projectId/files/:fileId" element={<FilesPage />} />
              <Route path="/projects/:projectId/simulate" element={<SimulatePage />} />
            </Route>
            <Route path="/debug/dashboard" element={<DebugDashboardPage />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </JotaiProvider>
  );
}
