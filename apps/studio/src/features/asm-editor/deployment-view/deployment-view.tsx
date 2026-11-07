import { useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Amount } from "@signumjs/util";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Amount as AmountView } from "@/components/ui/amount.tsx";
import { AdaptiveScrollArea } from "@/components/ui/adaptive-scroll-area.tsx";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { useLabelMaps } from "@/features/inspector/workspace/use-label-maps";
import { resolveLabelMap } from "@/features/inspector/model/resolve-label-map";
import { generateLabels } from "@/features/inspector/compiler/label-generator";
import type { SlotLabel } from "@/features/inspector/model/label-map";
import { baseFromByteData, buildDataStack, paramSlots } from "@/features/deployment/deploy-params";
import { compileVerbose, findOverwrittenParams } from "@/features/deployment/overwritten-params";
import { pickReference } from "@/features/deployment/reference-search";
import { flowRequest, referenceDeployMinFeePlanck, type DeployRequest } from "@/features/deployment/deploy-request";
import { signaToPlanck } from "@/features/deployment/amounts";
import { useReferenceSearch } from "@/features/deployment/use-reference-search";
import { ParameterForm, parametersReady } from "@/features/deployment/ui/parameter-form";
import { DataStackPreview } from "@/features/deployment/ui/data-stack-preview";
import { ReferencePicker } from "@/features/deployment/ui/reference-picker";
import type { MachineData } from "../machine-data.ts";
import { WalletConnection } from "./wallet-connection.tsx";
import { DeploymentFlow } from "./deployment-flow.tsx";
import { formatNumber, t } from "@/i18n/runtime";

type Path = "full" | "reference";

/** Signum limits for the AT name and description. */
const NAME_MAX = 30;
const DESCRIPTION_MAX = 1000;
const SLOTS_PER_PAGE = 32;

/**
 * Publishing a compiled contract — in full, or as a new instance of an
 * original already on chain that runs the same code.
 *
 * Both paths share the parameters: the slots the Label Map (or the
 * generator's TESTBED suggestions) marks as `param`, laid over the compiler's
 * initial memory.
 */
export function DeploymentView({
  data,
  source,
  successAction,
}: {
  data: MachineData;
  source: string;
  successAction?: (transactionId: string) => ReactNode;
}) {
  const status = useWalletStatus();
  const prefix = status?.network === "TestNet" ? "TS" : "S";
  const search = useReferenceSearch(data.MachineCodeHashId, status?.ledger ?? null);
  const labelMaps = useLabelMaps();

  const [path, setPath] = useState<Path>("full");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [name, setName] = useState(data.PName);
  const [description, setDescription] = useState(data.PDescription);
  const [activation, setActivation] = useState(() => Amount.fromPlanck(String(data.PActivationAmount)).getSigna());
  const [fee, setFee] = useState<string | null>(null);
  const [deadline, setDeadline] = useState(1440);

  const selected =
    search.candidates.find((c) => c.contractId === selectedId) ??
    pickReference(search.candidates, status?.accountId ?? null);
  const effectivePath: Path = path === "reference" && selected ? "reference" : "full";

  const resolution = resolveLabelMap(data.MachineCodeHashId, undefined, labelMaps);
  const map = resolution.kind === "hash" ? resolution.entry.map : null;
  const generated = useMemo(() => {
    const r = generateLabels(source);
    return r.ok ? r.labels.slots : null;
  }, [source]);
  const params = useMemo(() => paramSlots(generated, map), [generated, map]);
  const overwrites = useMemo(() => {
    const verbose = compileVerbose(source);
    return verbose ? findOverwrittenParams(verbose.assembly, verbose.memory, params.map((p) => p.index)) : [];
  }, [source, params]);
  const base = useMemo(() => baseFromByteData(data.ByteData), [data.ByteData]);
  const labels = useMemo<SlotLabel[]>(() => [...(generated ?? []), ...(map?.slots ?? [])], [generated, map]);

  const capacity =
    effectivePath === "reference" && selected
      ? selected.header.dataPages * SLOTS_PER_PAGE
      : data.DataPages * SLOTS_PER_PAGE;
  const enums = map?.enums ?? {};
  const stack = buildDataStack({ params, values, ctx: { prefix, enums }, capacity, base, memory: data.Memory, labels });

  const fullMinFee = String(data.MinimumFeeNQT);
  const referenceMinFee = selected ? referenceDeployMinFeePlanck(selected.header).toString() : null;
  const minFeePlanck = effectivePath === "reference" && referenceMinFee ? referenceMinFee : fullMinFee;
  const feeSigna = fee ?? Amount.fromPlanck(minFeePlanck).getSigna();

  const feePlanck = signaToPlanck(feeSigna);
  const activationPlanck = signaToPlanck(activation);
  const amountsValid = feePlanck !== null && (effectivePath === "reference" || activationPlanck !== null);
  const ready = parametersReady(stack.fields, overwrites, confirmed) && stack.data !== null && amountsValid;
  const current: DeployRequest | null = !ready
    ? null
    : effectivePath === "reference" && selected
      ? { kind: "reference", reference: selected, name, description, data: stack.data! }
      : {
          kind: "full",
          machine: data,
          name,
          description,
          activationPlanck: activationPlanck!,
          data: stack.data!,
        };
  const lastRequest = useRef<{ request: DeployRequest; fee: string } | null>(null);
  if (current) lastRequest.current = { request: current, fee: feePlanck! };
  const flow = flowRequest(current, lastRequest.current?.request ?? null);

  const choosePath = (next: Path) => {
    setPath(next);
    setFee(null); // each path has its own minimum
  };

  return (
    <AdaptiveScrollArea>
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold">{t("asm-editor.deploy.title")}</h2>
        <Alert className="my-4">
          <AlertCircle className="h-4 w-4" color="red" />
          <AlertTitle>{t("asm-editor.deploy.noteTitle")}</AlertTitle>
          <AlertDescription>{t("asm-editor.deploy.note")}</AlertDescription>
        </Alert>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("asm-editor.deploy.summary")}</CardTitle>
              <CardDescription>{t("asm-editor.deploy.summaryHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t("asm-editor.deploy.codeSize")}</h4>
                  <p className="font-medium">
                    {t("asm-editor.meta.bytes", {
                      count: data.ByteCode.length / 2,
                      n: formatNumber(data.ByteCode.length / 2),
                    })}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t("asm-editor.deploy.minimumFee")}</h4>
                  <p className="font-medium">
                    {t("asm-editor.deploy.pathFull")}: <AmountView amount={fullMinFee} isAtomic />
                  </p>
                  {referenceMinFee && (
                    <p className="font-medium">
                      {t("asm-editor.deploy.pathReference")}: <AmountView amount={referenceMinFee} isAtomic />
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("asm-editor.reference.title")}</CardTitle>
              <CardDescription>{t("asm-editor.reference.hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup value={effectivePath} onValueChange={(v) => choosePath(v as Path)} className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="full" />
                  {t("asm-editor.deploy.pathFull")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="reference" disabled={!selected} />
                  {t("asm-editor.deploy.pathReference")}
                </label>
              </RadioGroup>
              <ReferenceStatus search={search} connected={status !== null} />
              {selected && effectivePath === "reference" && (
                <div className="space-y-2">
                  <Label>{t("asm-editor.reference.original")}</Label>
                  <ReferencePicker
                    candidates={search.candidates}
                    selected={selected.contractId}
                    onSelect={setSelectedId}
                    prefix={prefix}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("asm-editor.params.title")}</CardTitle>
              <CardDescription>{t("asm-editor.params.hint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ParameterForm
                fields={stack.fields}
                enums={enums}
                prefix={prefix}
                values={values}
                onChange={(index, value) => setValues((v) => ({ ...v, [index]: value }))}
                overwrites={overwrites}
                confirmed={confirmed}
                onConfirm={(index, yes) =>
                  setConfirmed((c) => {
                    const next = new Set(c);
                    if (yes) next.add(index);
                    else next.delete(index);
                    return next;
                  })
                }
                sourceKnown
              />
              {stack.tooLarge && (
                <p className="text-sm text-[var(--mag)]">{t("asm-editor.params.tooLarge", { slots: capacity })}</p>
              )}
              <DataStackPreview rows={stack.rows} prefix={prefix} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("asm-editor.deploy.settings")}</CardTitle>
              <CardDescription>{t("asm-editor.deploy.settingsHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contract-name">{t("asm-editor.deploy.name")}</Label>
                    <Input id="contract-name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="activation-amount">{t("asm-editor.deploy.activationSigna")}</Label>
                    {effectivePath === "full" ? (
                      <>
                        <Input
                          id="activation-amount"
                          type="number"
                          min={0}
                          step={0.1}
                          value={activation}
                          onChange={(e) => setActivation(e.target.value)}
                          aria-invalid={activationPlanck === null ? true : undefined}
                        />
                        {activationPlanck === null && (
                          <p className="text-xs text-[var(--mag)]">{t("asm-editor.params.error.invalid")}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-medium">
                          <AmountView amount={selected!.header.minActivationPlanck} isAtomic />
                        </p>
                        <p className="text-xs text-muted-foreground">{t("asm-editor.reference.inherited")}</p>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contract-description">{t("asm-editor.deploy.description")}</Label>
                  <Input
                    id="contract-description"
                    value={description}
                    maxLength={DESCRIPTION_MAX}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fee">{t("asm-editor.deploy.feeSigna")}</Label>
                    <Input
                      id="fee"
                      type="number"
                      step={0.1}
                      value={feeSigna}
                      onChange={(e) => setFee(e.target.value)}
                      aria-invalid={feePlanck === null ? true : undefined}
                    />
                    {feePlanck === null && <p className="text-xs text-[var(--mag)]">{t("asm-editor.params.error.invalid")}</p>}
                    <p className="text-xs text-muted-foreground">
                      {t("asm-editor.deploy.minimum")} <AmountView amount={minFeePlanck} isAtomic />
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">{t("asm-editor.deploy.deadline")}</Label>
                    <Input
                      id="deadline"
                      type="number"
                      onChange={(e) => setDeadline(Number(e.target.value))}
                      value={deadline}
                      max="1440"
                    />
                    <p className="text-xs text-muted-foreground">{t("asm-editor.deploy.deadlineHint")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <WalletConnection />
          {!flow.live && (
            <p className="text-sm text-muted-foreground text-center">{t("asm-editor.deploy.fixParams")}</p>
          )}
          {flow.request && (
            <DeploymentFlow
              request={flow.request}
              codeHash={data.MachineCodeHashId}
              fee={Amount.fromPlanck(flow.live ? feePlanck! : lastRequest.current!.fee)}
              deadline={deadline}
              disabled={!flow.live}
              successAction={successAction}
            />
          )}
        </div>
      </div>
    </AdaptiveScrollArea>
  );
}

function ReferenceStatus({
  search,
  connected,
}: {
  search: ReturnType<typeof useReferenceSearch>;
  connected: boolean;
}) {
  if (!connected) return <p className="text-xs text-muted-foreground">{t("asm-editor.reference.connect")}</p>;
  if (search.state === "searching") {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("asm-editor.reference.searching")}
      </p>
    );
  }
  if (search.state === "failed") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{t("asm-editor.reference.failed", { message: search.error ?? "" })}</span>
        <Button variant="ghost" size="sm" onClick={search.retry}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          {t("asm-editor.reference.retry")}
        </Button>
      </div>
    );
  }
  if (search.state === "done" && search.candidates.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("asm-editor.reference.noneYet")}</p>;
  }
  return null;
}
