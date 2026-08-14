import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CodeIcon, FlaskConicalIcon, BugIcon, RocketIcon } from "lucide-react";

interface Step {
  title: string;
  blurb: string;
  icon: typeof CodeIcon;
  /** The testbed does not exist yet — `src/features/testbed/` is empty. */
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
    blurb: "Automated contract tests will run against your code as you change it.",
    icon: FlaskConicalIcon,
    soon: true,
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
            <Card
              className={
                "group h-full transition-colors " +
                (step.soon
                  ? "border-dashed bg-transparent"
                  : "hover:border-signum-blue/40 dark:hover:border-signum-lightblue/40")
              }
            >
              <CardContent className="flex h-full flex-col gap-2.5 p-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] font-mono text-[11px] tabular-nums " +
                      (step.soon
                        ? "bg-muted text-muted-foreground"
                        : "bg-signum-blue/10 text-signum-blue dark:bg-signum-lightblue/15 dark:text-signum-lightblue")
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
                        : "text-muted-foreground transition-colors group-hover:text-signum-blue dark:group-hover:text-signum-lightblue")
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
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
