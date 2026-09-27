import { useEffect, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import type { StandardLedger } from "@signumjs/core";
import { HttpError } from "@signumjs/http";
import { SmartC } from "smartc-signum-compiler";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import type { FileMetadata } from "@/lib/file-system";
import type { DeploymentAnswer } from "./rail-cells";
import {
  deploymentKey,
  onDeploymentsChanged,
  pendingDeployment,
  settleDeployment,
  watchChain,
  type PendingDeployment,
} from "./deployment-watch";

/**
 * How many copies of this code are on chain.
 *
 * Asked rather than stored: the code hash is a pure function of the compiled
 * code, so the answer travels with the code instead of with this browser
 * profile — it survives a reload, another machine and a fresh import.
 *
 * The node comes from the connected wallet and from nowhere else. Studio ships
 * no default node: a local-first tool should not quietly tell a third-party
 * server what code you are writing.
 *
 * A deploy sent from this session reads "deploying…" until its transaction is
 * in a block — the chain lists nothing before that — and the cached answer
 * for that code is dropped then, so the next ask sees the new contract.
 */

/** Ten, so that a full page means "at least ten" and the cell can say `9+`. */
export const DEPLOYMENT_PAGE_SIZE = 10;

/**
 * The one branch this function can return. Narrower than `DeploymentAnswer`
 * on purpose: counting a list always answers, so callers reading `.total`
 * should not have to prove that first.
 */
export type DeploymentCount = Extract<DeploymentAnswer, { state: "answered" }>;

export function summariseContracts(
  contracts: Pick<Contract, "creator">[],
  accountId: string | undefined,
): DeploymentCount {
  return {
    state: "answered",
    total: contracts.length,
    mine: accountId
      ? contracts.filter((contract) => contract.creator === accountId).length
      : 0,
    capped: contracts.length >= DEPLOYMENT_PAGE_SIZE,
  };
}

/**
 * Whether the wait for this transaction is over: it is in a block, or the node
 * no longer knows it (expired or dropped from the pool — it will never land).
 * Anything else, including a failed request, keeps waiting.
 */
export async function hasSettled(
  ledger: Pick<StandardLedger, "transaction">,
  transactionId: string,
): Promise<boolean> {
  try {
    const transaction = await ledger.transaction.getTransaction(transactionId);
    return Boolean(transaction.block);
  } catch (error) {
    // Signum's "Unknown transaction".
    return error instanceof HttpError && error.data?.errorCode === 5;
  }
}

/** Answers per node and code hash, for the session. */
const cache = new Map<string, DeploymentAnswer>();

async function settleIfLanded(
  ledger: StandardLedger,
  deployment: PendingDeployment,
) {
  if (!(await hasSettled(ledger, deployment.transactionId))) return;
  cache.delete(deploymentKey(deployment.nodeHost, deployment.codeHash));
  settleDeployment(deployment);
}

export function useDeploymentCount(
  contract: FileMetadata | null,
): DeploymentAnswer {
  const fs = useFileSystem();
  const wallet = useWalletStatus();
  const [answer, setAnswer] = useState<DeploymentAnswer>({
    state: "no-wallet",
  });
  // Bumped when a deploy is announced or settles, to ask again.
  const [revision, setRevision] = useState(0);

  useEffect(
    () => onDeploymentsChanged(() => setRevision((r) => r + 1)),
    [],
  );

  useEffect(() => {
    if (!contract || !wallet) {
      setAnswer({ state: "no-wallet" });
      return;
    }

    let cancelled = false;
    let stopWatch: (() => void) | undefined;

    async function ask() {
      const { content } = await fs.loadFile<string>(contract!.id);
      let hash: string;
      try {
        const compiler = new SmartC({
          language: "C",
          sourceCode: content ?? "",
        });
        hash = compiler.compile().getMachineCode().MachineCodeHashId;
      } catch {
        // No hash without a compile, so there is no question to ask. Returning
        // here would leave the previous answer on screen — a count that
        // describes code the user has since changed, which is the same stale
        // fact the staleness rule forbids everywhere else.
        if (!cancelled) setAnswer({ state: "no-code" });
        return;
      }

      if (cancelled) return;
      const ledger = wallet!.ledger;
      const nodeHost = ledger.service.settings.nodeHost;

      const waiting = pendingDeployment(nodeHost, hash);
      if (waiting) {
        setAnswer({ state: "deploying" });
        const check = () => void settleIfLanded(ledger, waiting);
        stopWatch = watchChain(nodeHost, check);
        // It may have landed while nobody was watching.
        check();
        return;
      }

      const key = deploymentKey(nodeHost, hash);
      const cached = cache.get(key);
      if (cached) {
        if (!cancelled) setAnswer(cached);
        return;
      }

      if (!cancelled) setAnswer({ state: "asking" });

      const list = await wallet!.ledger.contract.getAllContractsByCodeHash({
        machineCodeHash: hash,
        includeDetails: false,
        firstIndex: 0,
        lastIndex: DEPLOYMENT_PAGE_SIZE - 1,
      });

      const summary = summariseContracts(list.ats, wallet!.accountId);
      cache.set(key, summary);
      if (!cancelled) setAnswer(summary);
    }

    // A failed or refused lookup is not an error state: the cell simply cannot
    // answer, and says so.
    ask().catch(() => !cancelled && setAnswer({ state: "no-wallet" }));

    return () => {
      cancelled = true;
      stopWatch?.();
    };
  }, [fs, wallet, contract?.id, contract?.lastModified, revision]);

  return answer;
}
