import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { CodeIcon, FlaskConicalIcon, BugIcon, RocketIcon } from "lucide-react";

interface Step {
  title: string;
  blurb: string;
  icon: typeof CodeIcon;
  soon?: boolean;
}

const STEPS: Step[] = [
  {
    title: "Write",
    blurb: "SmartC editor with completion, hover docs and live compiler diagnostics.",
    icon: CodeIcon,
  },
  {
    title: "Test",
    blurb: "Write tests beside your contract and run them in the browser, with values inline.",
    icon: FlaskConicalIcon,
  },
  {
    title: "Simulate",
    blurb: "Step through against a scenario: breakpoints, variables, a mock ledger.",
    icon: BugIcon,
  },
  {
    title: "Deploy",
    blurb: "Connect your wallet and publish to Signum testnet or mainnet.",
    icon: RocketIcon,
  },
];

export function HowItWorks() {
  return (
    <section className="px-6 py-6">
      <h2 className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        How it works
        <span className="h-px flex-1 bg-border" />
      </h2>

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <Panel
              variant="bracketed"
              className={
                "motion-control group h-full " +
                (step.soon
                  ? "border-dashed bg-transparent"
                  : "hover:border-[var(--accent-2)]")
              }
            >
              <div className="flex h-full flex-col gap-2.5 p-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] font-mono text-[11px] tabular-nums " +
                      (step.soon
                        ? "bg-muted text-muted-foreground"
                        : "bg-[color-mix(in_srgb,var(--accent-1)_12%,transparent)] text-[var(--accent-2)]")
                    }
                  >
                    {index + 1}
                  </span>
                  <span
                    className={
                      "text-sm font-medium " + (step.soon ? "text-muted-foreground" : "")
                    }
                  >
                    {step.title}
                  </span>
                  <step.icon
                    className={
                      "ml-auto h-4 w-4 shrink-0 " +
                      (step.soon
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground transition-colors group-hover:text-[var(--accent-2)]")
                    }
                  />
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">{step.blurb}</p>

                {step.soon && (
                  <Badge
                    variant="secondary"
                    className="mt-auto w-fit font-mono text-[10px] uppercase tracking-wider"
                  >
                    soon
                  </Badge>
                )}
              </div>
            </Panel>
          </li>
        ))}
      </ol>
    </section>
  );
}
