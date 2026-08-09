import "./index.css";
import { AppLayout } from "./components/ui/layout/app-layout";
import { jotaiStore } from "./stores/jotai-store";
import { Provider as JotaiProvider } from "jotai";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "next-themes";
import { FilesPage } from "./pages/files/files-page";
import { DebugDashboardPage } from "./pages/debug/debug-dashboard-page";
export function App() {
  return (
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route
                path="/"
                element={
                  <div>
                    <h1>TO DO: some home page</h1>
                  </div>
                }
              />
              <Route path="/projects/:projectId/files/:fileId" element={<FilesPage />} />
            </Route>
            <Route path="/debug/dashboard" element={<DebugDashboardPage />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </JotaiProvider>
  );
}
