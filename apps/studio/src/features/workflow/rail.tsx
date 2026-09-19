import { useLocation, useNavigate, useParams } from "react-router";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFileSystem } from "@/hooks/use-file-system.ts";
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

const TONE: Record<CellContent["tone"], string> = {
  good: "var(--green)",
  bad: "var(--mag)",
  neutral: "var(--dim)",
};

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
 * Each cell carries a fact rather than a step number, because the process is
 * not a pipeline: the first three repeat until the contract is right, and the
 * arc beneath them says so. Deploy is set apart by a gap — it happens once and
 * it costs money.
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
  const { projectId, files, contract: choice, status } = useProjectFacts(routeFolderId);
  const contract = choice?.contract ?? null;

  const scenarios = files.filter((file) => file.name.endsWith(".scenario.json"));
  const tests = files.filter((file) => file.name.endsWith(".test.ts"));

  // The same file the Test cell would open, so the fact and the click agree.
  const recentIds = fs.recents.list().map((entry) => entry.fileId);
  const activeTest =
    tests.find((file) => recentIds.includes(file.id)) ?? tests[0] ?? null;

  const { verdict, compiling } = useCompileVerdict(projectId, contract, status.compile);
  const deployment = useDeploymentCount(contract);

  const cells: Cell[] = [
    {
      id: "write",
      label: "Write",
      content: contract
        ? compileCell(verdict, contract.lastModified)
        : { fact: "no contract", tone: "neutral" },
      go: contract
        ? () => navigate(`/projects/${projectId}/files/${contract.id}`)
        : undefined,
    },
    {
      id: "test",
      label: "Test",
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
      label: "Simulate",
      content: simulateCell(scenarios.length),
      go: contract ? () => navigate(`/projects/${projectId}/simulate`) : undefined,
    },
    {
      id: "deploy",
      label: "Deploy",
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
    ? ` · a second contract (${choice.ignored[0]!.name}) is ignored`
    : "";

  return (
    <div className="flex items-center" role="group" aria-label="Workflow">
      <div className="relative pb-[11px]">
        <div className="flex">
          {cells.slice(0, 3).map((cell) => (
            <RailCell
              key={cell.id}
              cell={cell}
              active={here(cell.id)}
              pulsing={cell.id === "write" && compiling}
              note={cell.id === "write" ? ignoredNote : ""}
            />
          ))}
        </div>
        {/* The loop: these three repeat. A drawing, not a control. */}
        <svg
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[10px] w-full"
          viewBox="0 0 240 10"
          preserveAspectRatio="none"
        >
          <path
            d="M234 1 L234 6 Q234 9 231 9 L9 9 Q6 9 6 6 L6 1"
            fill="none"
            stroke="var(--border-2)"
            strokeWidth="1"
          />
          <path d="M6 1 l-2.5 3.5 h5 z" fill="var(--border-2)" />
        </svg>
      </div>

      <span aria-hidden className="w-[18px] text-center text-[var(--border-2)]">
        →
      </span>

      <RailCell cell={cells[3]!} active={here("deploy")} pulsing={false} note="" />
    </div>
  );
}

function RailCell({
  cell,
  active,
  pulsing,
  note,
}: {
  cell: Cell;
  active: boolean;
  pulsing: boolean;
  note: string;
}) {
  const barred = !cell.go;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={cell.go}
          disabled={barred}
          aria-current={active ? "page" : undefined}
          className={
            "motion-control flex min-w-[74px] flex-col items-start gap-px border border-r-0 px-2.5 py-1 last:border-r " +
            (active
              ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-1)_16%,transparent)] "
              : "border-[var(--border-1)] ") +
            (barred ? "opacity-40 " : "cursor-pointer hover:border-[var(--accent-2)] ")
          }
        >
          <span className="text-[10px] tracking-[0.4px] text-[var(--dim)]">
            {cell.label}
          </span>
          {/* Hidden below the threshold: navigation must never break, only reporting. */}
          <span
            className={
              "hidden font-mono text-[10.5px] lg:block " + (pulsing ? "motion-pulse" : "")
            }
            style={{ color: TONE[cell.content.tone] }}
          >
            {cell.content.fact}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {cell.label}
        {cell.content.hint ? ` — ${cell.content.hint}` : ""}
        {barred && !cell.content.hint ? " — needs a contract that compiles" : ""}
        {note}
      </TooltipContent>
    </Tooltip>
  );
}
