import type { ContractApi, TransactionApi } from "@signumjs/core";
import { classifyNodeError, InspectorError } from "@/features/inspector/chain/inspector-client";

/**
 * Finds contracts on chain whose code a new deployment can reference.
 *
 * A contract's id is the id of its deploy transaction. If that transaction
 * carries `referencedTransactionFullHash`, the contract is itself an instance
 * and the hash leads to the original. One step is always enough: the node
 * refuses a reference to an instance, because the referenced creation bytes
 * must hold code.
 */

export interface ReferenceLedger {
  contract: Pick<ContractApi, "getAllContractsByCodeHash">;
  transaction: Pick<TransactionApi, "getTransaction" | "getTransactionByFullHash">;
}

/** What an instance inherits from its original, read from the original's creation bytes. */
export interface CreationHeader {
  dataPages: number;
  callStackPages: number;
  userStackPages: number;
  minActivationPlanck: string;
  /** Hex of the original's initial memory — the base for an instance without source. */
  initialData: string;
}

export interface ReferenceCandidate {
  contractId: string;
  name: string;
  creator: string;
  height: number;
  fullHash: string;
  header: CreationHeader;
}

const SEARCH_HITS = 25;
const IN_FLIGHT = 5;
const AT_TYPE = 22;
const AT_CREATION = 0;

const u16 = (hex: string, byte: number) => parseInt(hex.slice(byte * 2 + 2, byte * 2 + 4) + hex.slice(byte * 2, byte * 2 + 2), 16) || 0;

function u64(hex: string, byte: number): bigint {
  let bigEndian = "";
  for (let i = 7; i >= 0; i--) bigEndian += hex.slice((byte + i) * 2, (byte + i) * 2 + 2);
  return bigEndian.length === 16 ? BigInt("0x" + bigEndian) : 0n;
}

/** Width of a length field, as the node writes it: by the number of pages it covers. */
const lengthWidth = (pages: number) => (pages * 256 <= 256 ? 1 : pages * 256 <= 32767 ? 2 : 4);

function readLength(hex: string, byte: number, width: number): number {
  let value = 0;
  for (let i = width - 1; i >= 0; i--) value = value * 256 + (parseInt(hex.slice((byte + i) * 2, (byte + i) * 2 + 2), 16) || 0);
  return value;
}

const codePagesOf = (creationBytes: string) => u16(creationBytes, 4);

/** Version, reserved, code pages, data pages, call-stack pages, user-stack pages, min activation; then code and data. */
export function parseCreationHeader(creationBytesHex: string): CreationHeader {
  const hex = creationBytesHex.toLowerCase();
  const codePages = codePagesOf(hex);
  const dataPages = u16(hex, 6);
  let byte = 20;
  const codeWidth = lengthWidth(codePages);
  const codeLength = readLength(hex, byte, codeWidth);
  byte += codeWidth + codeLength;
  const dataWidth = lengthWidth(dataPages);
  const dataLength = readLength(hex, byte, dataWidth);
  byte += dataWidth;
  return {
    dataPages,
    callStackPages: u16(hex, 8),
    userStackPages: u16(hex, 10),
    minActivationPlanck: u64(hex, 12).toString(),
    initialData: hex.slice(byte * 2, (byte + dataLength) * 2),
  };
}

const notFound = (e: unknown) => e instanceof InspectorError && e.kind === "not-found";

async function node<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (e) {
    const error = classifyNodeError(e);
    if (notFound(error)) return null;
    throw error;
  }
}

/** The original whose code `contractId` runs, or `null` when there is no valid one. */
export async function traceOriginal(ledger: ReferenceLedger, contractId: string): Promise<ReferenceCandidate | null> {
  const deploy = await node(() => ledger.transaction.getTransaction(contractId));
  if (!deploy) return null;
  const tx = deploy.referencedTransactionFullHash
    ? await node(() => ledger.transaction.getTransactionByFullHash(deploy.referencedTransactionFullHash!))
    : deploy;
  const creationBytes: string | undefined = tx?.attachment?.creationBytes;
  if (
    !tx ||
    tx.type !== AT_TYPE ||
    tx.subtype !== AT_CREATION ||
    tx.referencedTransactionFullHash ||
    !creationBytes ||
    codePagesOf(creationBytes) === 0
  ) {
    return null;
  }
  return {
    contractId: tx.transaction,
    name: tx.attachment?.name ?? "",
    creator: tx.sender,
    height: tx.height,
    fullHash: tx.fullHash,
    header: parseCreationHeader(creationBytes),
  };
}

export async function findReferences(
  ledger: ReferenceLedger,
  codeHash: string,
  signal?: AbortSignal,
): Promise<ReferenceCandidate[]> {
  let hits: string[];
  try {
    const list = await ledger.contract.getAllContractsByCodeHash({
      machineCodeHash: codeHash,
      includeDetails: false,
      firstIndex: 0,
      lastIndex: SEARCH_HITS - 1,
    });
    hits = list.ats.map((c) => c.at);
  } catch (e) {
    if (signal?.aborted) return [];
    throw classifyNodeError(e);
  }
  if (signal?.aborted) return [];

  const traced: (ReferenceCandidate | null)[] = new Array(hits.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < hits.length && !signal?.aborted) {
      const i = next++;
      traced[i] = await traceOriginal(ledger, hits[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, hits.length) }, worker));
  if (signal?.aborted) return [];

  const seen = new Set<string>();
  return traced.filter((c): c is ReferenceCandidate => {
    if (!c || seen.has(c.contractId)) return false;
    seen.add(c.contractId);
    return true;
  });
}

/** The connected account's own oldest original, otherwise the oldest. */
export function pickReference(candidates: ReferenceCandidate[], accountId: string | null): ReferenceCandidate | null {
  const oldest = (list: ReferenceCandidate[]) =>
    list.reduce<ReferenceCandidate | null>((best, c) => (!best || c.height < best.height ? c : best), null);
  return oldest(candidates.filter((c) => c.creator === accountId)) ?? oldest(candidates);
}
