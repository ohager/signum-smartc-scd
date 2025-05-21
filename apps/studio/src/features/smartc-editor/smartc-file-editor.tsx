import { lazy, Suspense } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { type File } from "@/lib/file-system";

interface Props {
  file: File;
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
