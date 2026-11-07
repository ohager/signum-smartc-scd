import type { ContractApi } from "@signumjs/core";
import type { MachineData } from "@/features/asm-editor/machine-data";
import type { CreationHeader, ReferenceCandidate } from "./reference-search";

/**
 * The two ways to put a contract on chain, as one value the deployment flow
 * can carry to the wallet. A reference deploy sends no code: the node copies
 * code, pages and minimum activation from the referenced original.
 */

export type DeployRequest =
  | { kind: "full"; machine: MachineData; name: string; description: string; activationPlanck: string; data: string[] }
  | {
      kind: "reference";
      reference: Pick<ReferenceCandidate, "fullHash" | "contractId">;
      name: string;
      description: string;
      data: string[];
    };

/** AT v3 `costPerPage` (10 × the SIP-34 fee quant). */
const COST_PER_PAGE_PLANCK = 10_000_000n;
/** The smallest fee any transaction pays. */
const MIN_FEE_PLANCK = 1_000_000n;

/** The node charges every page an instance gets, and a reference brings no code pages. */
export function referenceDeployMinFeePlanck(header: CreationHeader): bigint {
  const pages = BigInt(header.dataPages + header.callStackPages + header.userStackPages);
  const fee = pages * COST_PER_PAGE_PLANCK;
  return fee > MIN_FEE_PLANCK ? fee : MIN_FEE_PLANCK;
}

export async function buildUnsignedDeploy(
  ledger: { contract: Pick<ContractApi, "publishContract" | "publishContractByReference"> },
  request: DeployRequest,
  common: { senderPublicKey: string; feePlanck: string; deadline: number },
): Promise<string> {
  const shared = {
    name: request.name,
    description: request.description,
    data: request.data,
    senderPublicKey: common.senderPublicKey,
    feePlanck: common.feePlanck,
    deadline: common.deadline,
    skipAdditionalSecurityCheck: true,
  };
  const result =
    request.kind === "full"
      ? await ledger.contract.publishContract({
          ...shared,
          codeHex: request.machine.ByteCode,
          activationAmountPlanck: request.activationPlanck,
          dataPages: request.machine.DataPages,
          callStackPages: request.machine.CodeStackPages,
          userStackPages: request.machine.UserStackPages,
        })
      : await ledger.contract.publishContractByReference({
          ...shared,
          referencedTransactionFullHash: request.reference.fullHash,
        });
  return (result as { unsignedTransactionBytes: string }).unsignedTransactionBytes;
}

/**
 * What the deployment flow is given. While the form is invalid the flow keeps
 * the last valid request but may not start: unmounting it would drop a
 * deploy already waiting in XT Wallet, its success card and "Inspect" with it.
 */
export function flowRequest(
  current: DeployRequest | null,
  last: DeployRequest | null,
): { request: DeployRequest | null; live: boolean } {
  return { request: current ?? last, live: current !== null };
}
