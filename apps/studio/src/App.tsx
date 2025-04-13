import "./index.css";
import { AppLayout } from "./components/ui/layout/app-layout";
import { jotaiStore } from "./stores/jotaiStore";
import { Provider as JotaiProvider } from "jotai";
import { BrowserRouter, Route, Routes } from "react-router";
import { FilesPage } from "./pages/files/files-page";
export function App() {
  return (
    <JotaiProvider store={jotaiStore}>
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
            <Route
              path="/projects/:projectId/files/:fileId"
              element={<FilesPage />}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </JotaiProvider>
  );
}
