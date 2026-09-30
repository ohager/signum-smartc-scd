import { createClient } from "@signumjs/core/createClient";
import type { ContractApi } from "@signumjs/core";
import type { Contract } from "@signumjs/contracts";
import { Amount } from "@signumjs/util";
import { nodeHostOf, type Network } from "../model/networks";

/**
 * The inspector's view of the chain: read-only and wallet-free, one client per
 * node. Node errors are sorted into the three things the UI treats
 * differently — the contract is not there, the node is not there, or the node
 * said something else.
 */

export type ContractStatus = "running" | "stopped" | "finished" | "frozen" | "dead";

export interface ContractSummary {
  id: string;
  name: string;
  description: string;
  creator: string;
  /** Planck. */
  balance: string;
  status: ContractStatus;
  codeHash: string;
}

export class InspectorError extends Error {
  constructor(
    readonly kind: "not-found" | "unreachable" | "node",
    message: string,
  ) {
    super(message);
    this.name = "InspectorError";
  }
}

export interface LedgerLike {
  contract: Pick<
    ContractApi,
    | "getContract"
    | "getContractsByAccount"
    | "getAllContractIds"
    | "getAllContractsByCodeHash"
    | "getContractMapValuesByFirstKey"
    | "getSingleContractMapValue"
  >;
}

export interface InspectorClient {
  nodeHost: string;
  getContract(id: string): Promise<Contract>;
  listByCreator(accountId: string, opts?: { codeHash?: string }): Promise<ContractSummary[]>;
  countByCodeHash(hash: string): Promise<number>;
  listByCodeHash(hash: string, page: number, pageSize: number): Promise<ContractSummary[]>;
  getMapByKey1(
    id: string,
    key1: string,
    page: number,
    pageSize: number,
    value?: string,
  ): Promise<{ key2: string; value: string }[]>;
  getMapValue(id: string, key1: string, key2: string): Promise<string>;
}

export function contractStatus(c: Contract): ContractStatus {
  if (c.dead) return "dead";
  if (c.frozen) return "frozen";
  if (c.finished) return "finished";
  if (c.stopped) return "stopped";
  return "running";
}

export function toSummary(c: Contract): ContractSummary {
  return {
    id: c.at,
    name: c.name,
    description: c.description,
    creator: c.creator,
    balance: c.balanceNQT,
    status: contractStatus(c),
    codeHash: c.machineCodeHashId,
  };
}

/** Balance as the list shows it, so a filter for "2.5" finds 2.5 SIGNA. */
function signa(planck: string): string {
  try {
    return Amount.fromPlanck(planck).getSigna();
  } catch {
    return planck;
  }
}

export function filterSummaries(rows: ContractSummary[], query: string): ContractSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.id, r.name, r.description, r.status, signa(r.balance)].some((field) => field.toLowerCase().includes(q)),
  );
}

/** Node error codes 4 ("Incorrect …") and 5 ("Unknown …") both mean: no such contract. */
function classify(e: unknown): InspectorError {
  const error = e as { status?: number; data?: { errorCode?: number; errorDescription?: string }; message?: string };
  const code = error?.data?.errorCode;
  const message = error?.data?.errorDescription ?? error?.message ?? String(e);
  if (code === 4 || code === 5) return new InspectorError("not-found", message);
  if (e instanceof TypeError || error?.status === 0) return new InspectorError("unreachable", message);
  return new InspectorError("node", message);
}

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw classify(e);
  }
}

const ledgers = new Map<string, LedgerLike>();
const defaultLedger = (nodeHost: string): LedgerLike => {
  let ledger = ledgers.get(nodeHost);
  if (!ledger) {
    ledger = createClient({ nodeHost }) as unknown as LedgerLike;
    ledgers.set(nodeHost, ledger);
  }
  return ledger;
};

export function createInspectorClient(
  network: Network,
  makeLedger: (nodeHost: string) => LedgerLike = defaultLedger,
): InspectorClient {
  const nodeHost = nodeHostOf(network);
  const { contract } = makeLedger(nodeHost);
  return {
    nodeHost,
    getContract: (id) => call(() => contract.getContract(id)),
    listByCreator: (accountId, opts = {}) =>
      call(async () =>
        (await contract.getContractsByAccount({ accountId, machineCodeHash: opts.codeHash })).ats.map(toSummary),
      ),
    countByCodeHash: (hash) =>
      call(async () => (await contract.getAllContractIds({ machineCodeHash: hash })).atIds.length),
    listByCodeHash: (hash, page, pageSize) =>
      call(async () =>
        (
          await contract.getAllContractsByCodeHash({
            machineCodeHash: hash,
            includeDetails: false,
            firstIndex: page * pageSize,
            lastIndex: (page + 1) * pageSize - 1,
          })
        ).ats.map(toSummary),
      ),
    getMapByKey1: (id, key1, page, pageSize, value) =>
      call(async () =>
        (
          await contract.getContractMapValuesByFirstKey({
            contractId: id,
            key1,
            value,
            firstIndex: page * pageSize,
            lastIndex: (page + 1) * pageSize - 1,
          })
        ).keyValues,
      ),
    getMapValue: (id, key1, key2) =>
      call(async () => (await contract.getSingleContractMapValue({ contractId: id, key1, key2 })).value),
  };
}
