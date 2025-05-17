import { lazy, Suspense } from "react";
import type { ProjectFile } from "@/types/project.ts";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";

interface Props {
  file: ProjectFile;
}

const SmartCEditor = lazy(() => import("./smartc-editor"));

// wrapper for lazy loading
export function SmartCFileEditor({ file }: Props) {

  return (
    <Suspense fallback={<Loader />}>
      <SmartCEditor file={file} />
    </Suspense>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner />
    </div>
  );
}
