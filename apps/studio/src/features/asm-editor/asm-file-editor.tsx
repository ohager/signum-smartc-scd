import { lazy, Suspense } from "react";
import type { ProjectFile } from "@/types/project.ts";
import { LoadingSpinner } from "@/components/ui/loading-spinner.tsx";
import { type File } from "@/lib/file-system";

interface Props {
  file: File;
}

const AsmEditor = lazy(() => import("./asm-editor.tsx"));

// wrapper for lazy loading
export function AsmFileEditor({ file }: Props) {

  return (
    <Suspense fallback={<Loader />}>
      {/*<AsmEditor file={file} />*/}
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
