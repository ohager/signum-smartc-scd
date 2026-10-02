import { useEffect, useMemo, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { createLatest } from "../chain/latest";
import type { LabelMap } from "../model/label-map";
import { slotCount } from "../model/data-stack";
import { capabilities } from "../disasm/capabilities";
import { decode, type Disassembly } from "../disasm/decode";
import { buildNames, type Names } from "../disasm/names";
import { buildOutline, type Outline } from "../disasm/outline";
import { toAsm, type Provenance } from "../disasm/to-asm";
import { verifyRoundTrip, type VerifyResult } from "../disasm/verify";
import { buildXrefs, type Xrefs } from "../disasm/xrefs";

export interface DisassemblyView {
  dis: Disassembly;
  names: Names;
  outline: Outline;
  xrefs: Xrefs;
  capabilities: ReturnType<typeof capabilities>;
  /** null: not assemblable, so there is nothing to verify. */
  verify: VerifyResult | "pending" | null;
  asm: () => string;
}

/**
 * Everything the Code tab shows, computed once per contract and Label Map.
 * Verification runs the SmartC assembler, so it runs after the first paint,
 * and only the newest contract's answer is kept: a slow verify of the
 * contract the user just left must not land on the one they opened.
 */
export function useDisassembly(
  contract: Contract | null,
  labelMap: LabelMap | null,
  provenance: Omit<Provenance, "date">,
): DisassemblyView | null {
  const code = contract?.machineCode ?? "";
  const dataSlots = contract ? slotCount(contract.machineData) : 0;

  const base = useMemo(() => {
    if (!code) return null;
    const dis = decode(code);
    const names = buildNames(dis, labelMap, dataSlots);
    const xrefs = buildXrefs(dis);
    return { dis, names, outline: buildOutline(dis), xrefs, capabilities: capabilities(xrefs) };
  }, [code, labelMap, dataSlots]);

  const asm = useMemo(
    () => () => (base ? toAsm(base.dis, base.names, { ...provenance, date: new Date() }) : ""),
    // Provenance fields are plain strings; compare them, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, provenance.contractId, provenance.network, provenance.labelsFile, provenance.codeHash],
  );

  const [latest] = useState(createLatest);
  const [verify, setVerify] = useState<VerifyResult | "pending" | null>(null);
  useEffect(() => {
    if (!base?.dis.assemblable) {
      setVerify(null);
      return;
    }
    setVerify("pending");
    const work = new Promise<VerifyResult>((resolve) =>
      setTimeout(() => resolve(verifyRoundTrip(asm(), base.dis, code)), 0),
    );
    latest(work).then(({ current, value }) => current && setVerify(value));
  }, [base, asm, code, latest]);

  return base ? { ...base, verify, asm } : null;
}
