import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Amount } from "@signumjs/util";
import type { Contract } from "@signumjs/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Amount as AmountView } from "@/components/ui/amount.tsx";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { t } from "@/i18n/runtime";
import { DeploymentFlow } from "@/features/asm-editor/deployment-view/deployment-flow";
import { baseFromByteData, buildDataStack, paramSlots } from "@/features/deployment/deploy-params";
import { flowRequest, referenceDeployMinFeePlanck, type DeployRequest } from "@/features/deployment/deploy-request";
import { signaToPlanck } from "@/features/deployment/amounts";
import { ParameterForm, parametersReady } from "@/features/deployment/ui/parameter-form";
import { DataStackPreview } from "@/features/deployment/ui/data-stack-preview";
import type { SlotLabel } from "../model/label-map";
import { upsertSlot } from "../model/label-map-edits";
import { labelTarget, type IndexedLabelMap, type Resolution } from "../model/resolve-label-map";
import { updateFileText } from "../workspace/update-file";
import { resolveInstanceReference, type InstanceReference } from "../instance/instance-reference";

const SLOTS_PER_PAGE = 32;
const NO_OVERWRITES: never[] = [];

/**
 * A new contract running the code of a watched one. The inspector itself
 * stays read-only: this dialog hands the deployment to the same flow the
 * deploy page uses, which owns XT Wallet and signing.
 */
export function InstanceDeployDialog({
  open,
  onOpenChange,
  contract,
  resolution,
  ensureLabelMap,
  prefix,
  onDeployed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: Contract;
  resolution: Resolution;
  /** The Label Map file a parameter mark is written to, created if there is none. */
  ensureLabelMap: () => Promise<string | null>;
  prefix: "S" | "TS";
  onDeployed: (contractId: string) => void;
}) {
  const status = useWalletStatus();
  const [found, setFound] = useState<InstanceReference | null>(null);

  useEffect(() => {
    if (!open || !status) return;
    let cancelled = false;
    setFound(null);
    resolveInstanceReference(status.ledger, contract.at, contract.machineCodeHashId).then(
      (r) => !cancelled && setFound(r),
    );
    return () => {
      cancelled = true;
    };
  }, [open, status, contract.at, contract.machineCodeHashId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.instance.title", { name: contract.name })}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-auto pr-1">
          {!status ? (
            <p className="text-sm text-muted-foreground">{t("inspector.instance.connect")}</p>
          ) : !found ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("inspector.instance.resolving")}
            </p>
          ) : !found.ok ? (
            <p className="text-sm text-[var(--mag)]">
              {found.reason === "otherNetwork"
                ? t("inspector.instance.otherNetwork")
                : found.reason === "noOriginal"
                  ? t("inspector.instance.noOriginal")
                  : t("inspector.instance.node", { message: found.message ?? "" })}
            </p>
          ) : (
            <InstanceForm
              contract={contract}
              reference={found.reference}
              resolution={resolution}
              ensureLabelMap={ensureLabelMap}
              prefix={prefix}
              onDeployed={onDeployed}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstanceForm({
  contract,
  reference,
  resolution,
  ensureLabelMap,
  prefix,
  onDeployed,
}: {
  contract: Contract;
  reference: Extract<InstanceReference, { ok: true }>["reference"];
  resolution: Resolution;
  ensureLabelMap: () => Promise<string | null>;
  prefix: "S" | "TS";
  onDeployed: (contractId: string) => void;
}) {
  const fs = useFileSystem();
  const active: IndexedLabelMap | null =
    resolution.kind === "pinned" || resolution.kind === "hash" ? resolution.entry : null;
  const map = active?.map ?? null;
  const [values, setValues] = useState<Record<number, string>>({});
  const [name, setName] = useState(contract.name);
  const [description, setDescription] = useState(contract.description);
  const minFee = referenceDeployMinFeePlanck(reference.header).toString();
  const [fee, setFee] = useState(() => Amount.fromPlanck(minFee).getSigna());

  const capacity = reference.header.dataPages * SLOTS_PER_PAGE;
  const params = useMemo(() => paramSlots(null, map), [map]);
  const base = useMemo(() => baseFromByteData(reference.header.initialData), [reference.header.initialData]);
  const labels = map?.slots ?? [];
  const enums = map?.enums ?? {};
  const stack = buildDataStack({ params, values, ctx: { prefix, enums }, capacity, base, labels });
  const feePlanck = signaToPlanck(fee);
  const ready = parametersReady(stack.fields, NO_OVERWRITES, new Set()) && stack.data !== null && feePlanck !== null;
  const current: DeployRequest | null = ready
    ? { kind: "reference", reference, name, description, data: stack.data! }
    : null;
  const lastRequest = useRef<{ request: DeployRequest; fee: string } | null>(null);
  if (current) lastRequest.current = { request: current, fee: feePlanck! };
  const flow = flowRequest(current, lastRequest.current?.request ?? null);

  const markable = labelTarget(resolution).kind !== "choose";
  const mark = async (index: number, on: boolean) => {
    const fileId = await ensureLabelMap();
    if (!fileId) return;
    const existing = labels.find((l) => l.index === index);
    const { param: _drop, ...rest } = existing ?? { index, name: `slot${index}` };
    const next: SlotLabel = { ...rest, ...(on ? { param: true } : {}), origin: "manual" };
    try {
      await updateFileText(fs, fileId, (text) => upsertSlot(text, next));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  // Arrays and pointers into them cannot be parameters.
  const blocked = new Set(
    labels.flatMap((l) =>
      (l.length ?? 1) > 1 ? Array.from({ length: l.length! }, (_, i) => l.index + i) : l.comment === "array pointer" ? [l.index] : [], // i18n-ignore
    ),
  );

  return (
    <>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("asm-editor.params.title")}</h4>
        <ParameterForm
          fields={stack.fields}
          enums={enums}
          prefix={prefix}
          values={values}
          onChange={(index, value) => setValues((v) => ({ ...v, [index]: value }))}
          overwrites={NO_OVERWRITES}
          confirmed={new Set()}
          onConfirm={() => undefined}
          sourceKnown={false}
        />
        {stack.tooLarge && (
          <p className="text-sm text-[var(--mag)]">{t("asm-editor.params.tooLarge", { slots: capacity })}</p>
        )}
        <DataStackPreview rows={stack.rows} prefix={prefix} />
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t("inspector.instance.markParams")}</h4>
        {!markable && <p className="text-xs text-muted-foreground">{t("inspector.instance.ambiguous")}</p>}
        <div className="max-h-48 overflow-auto rounded border border-[var(--border-2)] p-2">
          {Array.from({ length: capacity }, (_, index) => {
            const label = labels.find((l) => l.index === index);
            return (
              <label key={index} className="flex items-center gap-2 py-0.5 font-mono text-xs">
                <Checkbox
                  checked={label?.param === true}
                  disabled={!markable || blocked.has(index)}
                  onCheckedChange={(c) => void mark(index, c === true)}
                />
                <span className="w-8 text-muted-foreground">{index}</span>
                <span>{label?.name ?? ""}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="instance-name">{t("asm-editor.deploy.name")}</Label>
          <Input id="instance-name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("asm-editor.deploy.activationAmount")}</Label>
          <p className="font-medium">
            <AmountView amount={reference.header.minActivationPlanck} isAtomic />
          </p>
          <p className="text-xs text-muted-foreground">{t("asm-editor.reference.inherited")}</p>
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="instance-description">{t("asm-editor.deploy.description")}</Label>
          <Input id="instance-description" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instance-fee">{t("asm-editor.deploy.feeSigna")}</Label>
          <Input
            id="instance-fee"
            type="number"
            step={0.1}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            aria-invalid={feePlanck === null ? true : undefined}
          />
          {feePlanck === null && <p className="text-xs text-[var(--mag)]">{t("asm-editor.params.error.invalid")}</p>}
          <p className="text-xs text-muted-foreground">
            {t("asm-editor.deploy.minimum")} <AmountView amount={minFee} isAtomic />
          </p>
        </div>
      </div>

      {!flow.live && <p className="text-center text-sm text-muted-foreground">{t("asm-editor.deploy.fixParams")}</p>}
      {flow.request && (
        <DeploymentFlow
          request={flow.request}
          codeHash={contract.machineCodeHashId}
          fee={Amount.fromPlanck(flow.live ? feePlanck! : lastRequest.current!.fee)}
          deadline={1440}
          disabled={!flow.live}
          successAction={(transactionId) => <AddOnce id={transactionId} onDeployed={onDeployed} />}
        />
      )}
    </>
  );
}

/** Puts the new instance on the watchlist once, however often the success message renders. */
function AddOnce({ id, onDeployed }: { id: string; onDeployed: (contractId: string) => void }) {
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (done.current === id) return;
    done.current = id;
    onDeployed(id);
  }, [id, onDeployed]);
  return <p className="text-xs">{t("inspector.instance.added")}</p>;
}
