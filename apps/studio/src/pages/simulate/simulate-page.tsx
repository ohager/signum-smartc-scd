import { useCallback, useEffect, useState } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { Badge } from "@/components/ui/badge";
import { Page, PageContent, PageHeader } from "@/components/ui/page";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { FileTypes } from "@/features/project/filetype-icons";
import {
  defaultScenario,
  serializeScenario,
} from "@/features/simulator/scenario/scenario-io";
import { useProjectFacts } from "@/features/workflow/use-project-facts";
import { DebugView } from "@/features/simulator/ui/debug-view";
import { t } from "@/i18n/runtime";

/**
 * A recording handed over by the test editor, carried in the history entry.
 *
 * It travels as navigation state rather than in a store, because that is what
 * makes the back and forward buttons work: the recording belongs to the visit,
 * not to the application.
 */
interface Replay {
  source: string;
  /** The recorded transaction stream, already converted to a scenario. */
  scenario: string;
  testName: string;
  returnTo: string;
}

/**
 * Stepping a contract against a scenario.
 *
 * A destination rather than a boolean inside the editor: the back button
 * works, and it sits beside `/debug/dashboard`, which was already a route.
 *
 * Two ways in. Normally it steps the project's own contract against the
 * scenario files beside it. Arriving from a test, it steps what that test
 * actually did — the run's recording, converted to a scenario, handed over in
 * the history entry.
 */
export function SimulatePage() {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const { projectId: routeFolderId = "" } = useParams<{ projectId: string }>();

  // Same resolution the rail uses, so the page and the cell that opened it
  // always agree on which project this is.
  const { projectId, files, contract: choice } = useProjectFacts(routeFolderId);
  const contract = choice?.contract ?? null;

  const replay =
    (useLocation().state as { replay?: Replay } | null)?.replay ?? null;
  // Which scenario is being stepped belongs in the address: it survives a
  // reload, it can be sent to someone, and the editor links straight into it.
  const [searchParams, setSearchParams] = useSearchParams();

  const [source, setSource] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<{ name: string; json: string }[]>(
    [],
  );
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!contract || replay) return;

    let cancelled = false;

    async function load() {
      const loaded = await fs.loadFile<string>(contract!.id);
      const scenarioFiles = files.filter((file) =>
        file.name.endsWith(".scenario.json"),
      );
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
  // actually used — beside the picker that would otherwise be empty. It is a
  // callback handed down, not a registration: nothing reaches into the header.
  const createScenario = useCallback(async () => {
    if (!projectId || !contract) return;

    const existing = new Set(
      fs.listFolderContents(projectId).files.map((f) => f.metadata.name),
    );
    const base = contract.name.split(".")[0]!.toLowerCase();
    let name = `${base}.scenario.json`;
    for (let n = 2; existing.has(name); n++)
      name = `${base}-${n}.scenario.json`;

    await fs.addFile(
      projectId,
      name,
      FileTypes.Scenario,
      serializeScenario(defaultScenario()),
    );
    // No navigation: the new scenario appears in this page's own picker,
    // because `useProjectFacts` hears the `file:added` event.
  }, [fs, projectId, contract?.id, contract?.name]);

  // A project without a contract has nothing to step through. The file system
  // hydrates synchronously from localStorage, so this is not a race with load.
  if (!replay && (!contract || missing)) return <Navigate to="/" replace />;
  if (!replay && source === null)
    return <div className="p-4 text-sm">{t("common.files.loading")}</div>;

  return (
    <Page>
      <PageHeader>
        <h1 className="text-sm font-semibold">{t("common.pages.simulate")}</h1>
        <Badge variant="secondary">
          {replay ? replay.testName : "SC-Simulator"}
        </Badge>
      </PageHeader>
      <PageContent className="overflow-hidden">
        {replay && (
          <p className="shrink-0 border-b border-[var(--border-1)] px-3 py-1 text-xs text-[var(--dim)]">
            {t("common.pages.replayNote")}
          </p>
        )}
        <DebugView
          source={replay ? replay.source : source!}
          scenarios={
            replay
              ? [{ name: t("common.pages.replayScenario", { test: replay.testName }), json: replay.scenario }]
              : scenarios
          }
          sourceLabel={replay ? `recording · ${replay.testName}` : undefined}
          initialScenario={searchParams.get("scenario") ?? undefined}
          // `replace`, so picking a scenario does not litter the history with
          // entries the back button would have to walk through.
          onScenarioChange={(name) =>
            setSearchParams({ scenario: name }, { replace: true })
          }
          // A replay belongs to one test run; there is no file to add a
          // scenario to.
          onNewScenario={replay ? undefined : createScenario}
          // `/projects/:projectId` is not a route — App.tsx has only the file
          // route and the two this phase adds. Closing goes back to the thing
          // being simulated.
          onClose={() =>
            navigate(
              replay
                ? replay.returnTo
                : `/projects/${projectId}/files/${contract!.id}`,
            )
          }
        />
      </PageContent>
    </Page>
  );
}
