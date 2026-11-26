import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/i18n/runtime";
import { setupDoneAtom, setupTabAtom } from "../state";
import { AGENT_TABS, SKILL_COMMAND, registerCommand, type AgentTab, type SetupTarget } from "./setup-commands";

/* Product names, never translated (see GLOSSARY.md). */
const PRODUCT: Record<Exclude<AgentTab, "other">, string> = {
  claude: "Claude Code", // i18n-ignore — product name
  codex: "Codex", // i18n-ignore — product name
};

const tabLabel = (agent: AgentTab) => (agent === "other" ? t("assistant.connect.setup.other") : PRODUCT[agent]);

async function copy(text: string) {
  try {
    // Throws, rather than returning undefined, when the API is missing (insecure context).
    await navigator.clipboard.writeText(text);
    toast.success(t("assistant.connect.setup.copied"));
  } catch {
    toast.error(t("assistant.connect.setup.copyFailed"));
  }
}

function Command({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-1 rounded-md border bg-muted/40 p-2">
      {/* Wraps instead of widening the dialog; select-all keeps it copyable when the clipboard is refused. */}
      <code className="min-w-0 flex-1 select-all whitespace-pre-wrap break-all font-mono text-xs">{text}</code>
      <Button variant="ghost" size="icon" className="size-6 shrink-0" aria-label={t("assistant.connect.setup.copy")} onClick={() => copy(text)}>
        <CopyIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold">{n}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm">{title}</span>
        {children}
      </div>
    </li>
  );
}

/*
 * Per-agent setup: register the relay, install the skill, restart. The commands come from the
 * dialog's live port and this tab's origin, so what is copied is what will connect.
 */
export function SetupSteps({ target }: { target: SetupTarget }) {
  const [tab, setTab] = useAtom(setupTabAtom);
  const setupDone = useAtomValue(setupDoneAtom);
  /* null until the user toggles: storage hydrates after the first render, and the default must follow it. */
  const [toggled, setToggled] = useState<boolean | null>(null);
  const expanded = toggled ?? !setupDone;

  return (
    <section className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="self-start px-1" onClick={() => setToggled(!expanded)}>
        {expanded ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
        {expanded ? t("assistant.connect.setup.hide") : t("assistant.connect.setup.show")}
      </Button>
      {expanded && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as AgentTab)}>
          <TabsList>
            {AGENT_TABS.map((agent) => (
              <TabsTrigger key={agent} value={agent}>
                {tabLabel(agent)}
              </TabsTrigger>
            ))}
          </TabsList>
          {AGENT_TABS.map((agent) => (
            <TabsContent key={agent} value={agent}>
              <ol className="mt-2 flex flex-col gap-3">
                <Step n={1} title={agent === "other" ? t("assistant.connect.setup.registerOther") : t("assistant.connect.setup.register")}>
                  <Command text={registerCommand(agent, target)} />
                </Step>
                <Step n={2} title={t("assistant.connect.setup.skill")}>
                  <Command text={SKILL_COMMAND} />
                </Step>
                <Step
                  n={3}
                  title={agent === "other" ? t("assistant.connect.setup.restartOther") : t("assistant.connect.setup.restart", { agent: PRODUCT[agent] })}
                />
              </ol>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
