import { useEffect, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { analyzeWithCompiler } from "@/features/smartc-editor/language/compiler-symbols";
import type { CompileVerdict, FileMetadata } from "@/lib/file-system";

/**
 * The project's compile verdict, compiling once if what is stored is missing
 * or stale.
 *
 * The persisted record doubles as the cache: a hit costs nothing, a miss costs
 * one compile and is then a hit for every later navigation, and an edit
 * invalidates it by moving the file's `lastModified`. The SmartC editor writes
 * the same record when it saves, so in practice this rarely does the work.
 * A realistic contract compiles in ~6.5 ms, which is what made the lazy
 * compile worth having at all.
 *
 * `analyzeWithCompiler` rather than `new SmartC(...)` directly: the language
 * service already wraps the compiler in exactly this try/catch, and it never
 * throws. One implementation of "does this compile", not two that can drift.
 */
export function useCompileVerdict(
  projectId: string,
  contract: FileMetadata | null,
  stored: CompileVerdict | undefined,
): { verdict: CompileVerdict | undefined; compiling: boolean } {
  const fs = useFileSystem();
  const [compiling, setCompiling] = useState(false);

  const fresh = !!contract && stored?.sourceModified === contract.lastModified;

  useEffect(() => {
    if (!contract || !projectId || fresh) return;

    let cancelled = false;
    setCompiling(true);

    // A microtask, so the rail paints before the compiler blocks the thread.
    void Promise.resolve().then(async () => {
      try {
        const { content } = await fs.loadFile<string>(contract.id);
        if (cancelled) return;

        const { error } = analyzeWithCompiler(content ?? "");
        // The compiler throws on the first error rather than collecting, so
        // one is all this can honestly claim.
        fs.status.recordCompile(projectId, {
          sourceModified: contract.lastModified,
          errorCount: error ? 1 : 0,
        });
        // No local re-render needed: `recordCompile` emits `status:updated`
        // and `useProjectFacts` hands the new verdict back down.
      } finally {
        if (!cancelled) setCompiling(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fs, projectId, contract?.id, contract?.lastModified, fresh]);

  return { verdict: fresh ? stored : undefined, compiling };
}
