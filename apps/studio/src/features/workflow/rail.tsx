import { useLocation, useNavigate, useParams } from "react-router";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { RailTrack, type Stop } from "./rail-track";
import {
  compileCell,
  deployCell,
  simulateCell,
  testCell,
  type CellContent,
} from "./rail-cells";
import { useProjectFacts } from "./use-project-facts";
import { useCompileVerdict } from "./use-compile-verdict";
import { useDeploymentCount } from "./use-deployment-count";
import { showsRail } from "./rail-visibility";
import { t } from "@/i18n/runtime";

interface Cell {
  id: "write" | "test" | "simulate" | "deploy";
  label: string;
  content: CellContent;
  /** Absent means the destination cannot be entered. */
  go?: () => void;
}

/**
 * Write · Test · Simulate → Deploy, for the project's one contract.
 *
 * Each stop carries a fact rather than a step number, because the process is
 * not a pipeline: the first three repeat until the contract is right, and the
 * bracket beneath them says so. Deploy sits outside it, past a break — it
 * happens once and it costs money.
 *
 * This decides *what* each stop says; `rail-track.tsx` draws it.
 */
export function WorkflowRail() {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { projectId: routeFolderId = "", fileId = "" } = useParams<{
    projectId: string;
    fileId: string;
  }>();

  // `projectId` here is the resolved project, which is not always what the
  // URL called one. Everything below keys off this and never off the param.
  const {
    projectId,
    files,
    contract: choice,
    status,
  } = useProjectFacts(routeFolderId);
  const contract = choice?.contract ?? null;

  const scenarios = files.filter((file) =>
    file.name.endsWith(".scenario.json"),
  );
  const tests = files.filter((file) => file.name.endsWith(".test.ts"));

  // The same file the Test cell would open, so the fact and the click agree.
  const recentIds = fs.recents.list().map((entry) => entry.fileId);
  const activeTest =
    tests.find((file) => recentIds.includes(file.id)) ?? tests[0] ?? null;

  const { verdict, compiling } = useCompileVerdict(
    projectId,
    contract,
    status.compile,
  );
  const deployment = useDeploymentCount(contract);

  // After every hook, so the hook order never depends on the folder.
  if (!showsRail(files, !!contract)) return null;

  const cells: Cell[] = [
    {
      id: "write",
      label: t("workflow.rail.write"),
      content: contract
        ? compileCell(verdict, contract.lastModified)
        : { fact: t("workflow.rail.noContract"), tone: "neutral" },
      go: contract
        ? () => navigate(`/projects/${projectId}/files/${contract.id}`)
        : undefined,
    },
    {
      id: "test",
      label: t("workflow.rail.test"),
      content: testCell(
        activeTest ? { modified: activeTest.lastModified } : null,
        activeTest ? status.tests[activeTest.id] : undefined,
        contract?.lastModified ?? 0,
      ),
      go: activeTest
        ? () => navigate(`/projects/${projectId}/files/${activeTest.id}`)
        : undefined,
    },
    {
      id: "simulate",
      label: t("workflow.rail.simulate"),
      content: simulateCell(scenarios.length),
      go: contract
        ? () => navigate(`/projects/${projectId}/simulate`)
        : undefined,
    },
    {
      id: "deploy",
      label: t("workflow.rail.deploy"),
      content: deployCell(deployment),
      // The only destination that can be barred, and only while the source
      // does not compile — Deploy is the one step that needs machine code.
      go:
        contract && verdict?.errorCount === 0
          ? () => navigate(`/projects/${projectId}/deploy`)
          : undefined,
    },
  ];

  const here = (id: Cell["id"]) => {
    if (id === "write") return contract ? fileId === contract.id : false;
    if (id === "test") return activeTest ? fileId === activeTest.id : false;
    return pathname.endsWith(`/${id}`);
  };

  const ignoredNote = choice?.ignored.length
    ? t("workflow.rail.ignoredContract", { name: choice.ignored[0]!.name })
    : "";

  return (
    <div
      className="flex shrink-0 items-center"
      role="group"
      aria-label={t("workflow.rail.label")}
    >
      <RailTrack
        stops={cells.map<Stop>((cell) => ({
          id: cell.id,
          label: cell.label,
          fact: cell.content.fact,
          tone: cell.content.tone,
          here: here(cell.id),
          barred: !cell.go,
          pulsing: cell.id === "write" && compiling,
          hint:
            (cell.content.hint ??
              (cell.go ? "" : t("workflow.rail.needsCompile"))) +
            (cell.id === "write" ? ignoredNote : ""),
          go: cell.go,
        }))}
      />
    </div>
  );
}
