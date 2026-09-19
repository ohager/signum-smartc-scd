import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { FilePlus2 } from "lucide-react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { FileTypes } from "@/features/project/filetype-icons";
import {
  defaultScenario,
  serializeScenario,
} from "@/features/simulator/scenario/scenario-io";
import { useProjectFacts } from "@/features/workflow/use-project-facts";
import { DebugView } from "@/features/simulator/ui/debug-view";

/**
 * Stepping the project's contract against a scenario.
 *
 * A destination rather than a boolean inside the editor: the back button
 * works, and it sits beside `/debug/dashboard`, which was already a route.
 */
export function SimulatePage() {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const { projectId: routeFolderId = "" } = useParams<{ projectId: string }>();

  // Same resolution the rail uses, so the page and the cell that opened it
  // always agree on which project this is.
  const { projectId, files, contract: choice } = useProjectFacts(routeFolderId);
  const contract = choice?.contract ?? null;

  const { addAction, removeAction } = usePageHeaderActions();

  const [source, setSource] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<{ name: string; json: string }[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!contract) return;

    let cancelled = false;

    async function load() {
      const loaded = await fs.loadFile<string>(contract!.id);
      const scenarioFiles = files.filter((file) => file.name.endsWith(".scenario.json"));
      const withContent = await Promise.all(
        scenarioFiles.map(async (file) => ({
          name: file.name,
          json: (await fs.loadFile<string>(file.id)).content ?? "",
        })),
      );

      if (cancelled) return;
      setSource(loaded.content ?? "");
      setScenarios(withContent);
    }

    load().catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [fs, files, contract?.id, contract?.lastModified]);

  // The action the SmartC editor used to own, moved to where scenarios are
  // actually used. Guarded inside rather than around: it sits above the early
  // return, like every other hook on this page.
  useEffect(() => {
    if (!projectId || !contract) return;

    addAction({
      id: "new-scenario",
      tooltip: "Create a run scenario for this contract",
      label: "New Scenario",
      icon: <FilePlus2 className="h-4 w-4" />,
      onClick: async () => {
        const existing = new Set(
          fs.listFolderContents(projectId).files.map((f) => f.metadata.name),
        );
        const base = contract.name.split(".")[0]!.toLowerCase();
        let name = `${base}.scenario.json`;
        for (let n = 2; existing.has(name); n++) name = `${base}-${n}.scenario.json`;

        await fs.addFile(projectId, name, FileTypes.Scenario, serializeScenario(defaultScenario()));
        // No navigation: the new scenario appears in this page's own picker,
        // because `useProjectFacts` hears the `file:added` event.
      },
      variant: "console",
    });
    return () => removeAction("new-scenario");
  }, [addAction, removeAction, fs, projectId, contract?.id, contract?.name]);

  // A project without a contract has nothing to step through. The file system
  // hydrates synchronously from localStorage, so this is not a race with load.
  if (!contract || missing) return <Navigate to="/" replace />;
  if (source === null) return <div className="p-4 text-sm">Loading…</div>;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">Simulate</h1>
        <Badge variant="secondary">SC-Simulator</Badge>
      </PageHeader>
      <PageContent className="overflow-hidden">
        <DebugView
          source={source}
          scenarios={scenarios}
          sourceLabel={
            scenarios.length ? `scenario · ${scenarios[0]!.name}` : "no scenario"
          }
          // `/projects/:projectId` is not a route — App.tsx has only the file
          // route and the two this phase adds. Closing goes back to the thing
          // being simulated.
          onClose={() => navigate(`/projects/${projectId}/files/${contract.id}`)}
        />
      </PageContent>
    </Page>
  );
}
