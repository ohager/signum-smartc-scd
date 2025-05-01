import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router";


const SCDFormEditor = lazy(() => import("./form-editor"));
const SCDCodeEditor = lazy(() => import("./code-editor"));

export const SCDBuilder = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const handleEditModeChange = (mode: "form" | "json") => {
    setSearchParams((s) => {
      s.set("mode", mode);
      return s;
    });
  };

  return (
    <div className="w-full p-4">
      <Tabs
        value={searchParams.get("mode") || "form"}
        onValueChange={(v) => handleEditModeChange(v as "form" | "json")}
      >
        <TabsList>
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <Suspense fallback={<EditorLoadingState />}>
            <SCDFormEditor />
          </Suspense>
        </TabsContent>

        <TabsContent value="json">
          <Suspense fallback={<EditorLoadingState />}>
            <SCDCodeEditor />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
};

function EditorLoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner />
    </div>
  );
}
