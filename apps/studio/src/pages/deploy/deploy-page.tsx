import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useProjectFacts } from "@/features/workflow/use-project-facts";
import { DeploymentView } from "@/features/asm-editor/deployment-view/deployment-view";
import type { MachineData } from "@/features/asm-editor/machine-data";
import { SmartC } from "smartc-signum-compiler";

/**
 * Publishing the project's contract.
 *
 * Compiles the contract source here rather than reading the `.asm` file: that
 * file is a build product which may have been hand-edited, and deploying a
 * stale or altered assembly is a mistake worth making impossible.
 *
 * `SmartC` directly rather than `analyzeWithCompiler`, because this needs the
 * machine code and not just the verdict.
 */
export function DeployPage() {
  const fs = useFileSystem();
  const { projectId: routeFolderId = "" } = useParams<{ projectId: string }>();
  const { contract: choice } = useProjectFacts(routeFolderId);
  const contract = choice?.contract ?? null;

  const [machineData, setMachineData] = useState<MachineData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contract) return;

    let cancelled = false;

    async function compile() {
      const { content } = await fs.loadFile<string>(contract!.id);
      if (cancelled) return;

      try {
        const compiler = new SmartC({ language: "C", sourceCode: content ?? "" });
        setMachineData(compiler.compile().getMachineCode());
        setError(null);
      } catch (e: any) {
        setError(e.message);
      }
    }

    compile().catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [fs, contract?.id, contract?.lastModified]);

  if (!contract) return <Navigate to="/" replace />;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">Deploy</h1>
        <Badge variant="secondary">Signum</Badge>
      </PageHeader>
      {/* No `overflow-auto` here: `DeploymentView` wraps itself in an
          `AdaptiveScrollArea`, and two scroll containers give two scrollbars. */}
      <PageContent className="p-4">
        {error && (
          <p className="text-sm" style={{ color: "var(--mag)" }}>
            <span aria-hidden>● </span>
            The contract does not compile, so there is nothing to publish: {error}
          </p>
        )}
        {!error && !machineData && <p className="text-sm">Compiling…</p>}
        {machineData && <DeploymentView data={machineData} />}
      </PageContent>
    </Page>
  );
}
