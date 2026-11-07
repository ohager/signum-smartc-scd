import type { ContractApi } from "@signumjs/core";
import { classifyNodeError } from "../chain/inspector-client";
import { traceOriginal, type ReferenceCandidate, type ReferenceLedger } from "@/features/deployment/reference-search";

export type InstanceReference =
  | { ok: true; reference: ReferenceCandidate }
  | { ok: false; reason: "otherNetwork" | "noOriginal" | "node"; message?: string };

/**
 * The original a new instance of a watched contract would reference, looked
 * up on the node XT Wallet signs for — not the node the inspector reads from.
 * If that node does not know the contract, or knows other code under its id,
 * the wallet is on another network and the reference would be meaningless.
 */
export async function resolveInstanceReference(
  ledger: ReferenceLedger & { contract: Pick<ContractApi, "getContract"> },
  contractId: string,
  codeHash: string,
): Promise<InstanceReference> {
  try {
    let onWalletNode;
    try {
      onWalletNode = await ledger.contract.getContract(contractId);
    } catch (e) {
      const error = classifyNodeError(e);
      if (error.kind === "not-found") return { ok: false, reason: "otherNetwork" };
      throw error;
    }
    if (onWalletNode.machineCodeHashId !== codeHash) return { ok: false, reason: "otherNetwork" };
    const reference = await traceOriginal(ledger, contractId);
    return reference ? { ok: true, reference } : { ok: false, reason: "noOriginal" };
  } catch (e) {
    return { ok: false, reason: "node", message: classifyNodeError(e).message };
  }
}
