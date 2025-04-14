import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ProjectFile } from "@/types/project";
import { lazy, Suspense, useState } from "react";

const SCDFormEditor = lazy(() => import("./form-editor"));
interface Props {
  file: ProjectFile;
}

export const SCDBuilder = ({ file }: Props) => {
  const [mode, setMode] = useState<"form" | "json">("form");

  return (
    <div className="w-full p-4">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "form" | "json")}>
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
            {/* <MonacoJsonEditor value={value} onChange={onChange} /> */}
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
