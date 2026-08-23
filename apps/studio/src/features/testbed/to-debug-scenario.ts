import type { ScenarioFile, ScenarioTx } from "@/features/simulator/scenario/scenario.types";
import type { TestRecording } from "./runner/recording";

/** The testbed's default creator when a test does not name one. */
const DEFAULT_CREATOR = 555n;

/** Headroom above what a sender spends, so replay never fails on a rounding edge. */
const FUNDING_HEADROOM = 1_0000_0000n;

/**
 * Converts a recorded run into a scenario the step debugger can replay.
 *
 * The testbed never pre-funds accounts while the debugger's engine does, so
 * senders are funded here with what they spent plus headroom. Without it a test
 * that passed would fail on replay with a negative balance.
 */
export function toDebugScenario(recording: TestRecording): ScenarioFile {
  const spentBySender = new Map<string, bigint>();

  const transactions: ScenarioTx[] = recording.transactions.map((raw) => {
    const sender = String(raw.sender);
    const amount = BigInt((raw.amount as bigint | number | string) ?? 0);
    spentBySender.set(sender, (spentBySender.get(sender) ?? 0n) + amount);

    const tx: ScenarioTx = {
      block: Number(raw.blockheight ?? 1),
      sender,
      amount: amount.toString(),
    };
    if (raw.txid !== undefined) tx.txId = String(raw.txid);
    if (raw.messageText !== undefined) tx.message = String(raw.messageText);
    if (raw.messageHex !== undefined) tx.messageHex = String(raw.messageHex);
    return tx;
  });

  return {
    version: 2,
    creator: String(recording.creator ?? DEFAULT_CREATOR),
    accounts: [...spentBySender].map(([id, spent]) => ({
      id,
      balance: (spent + FUNDING_HEADROOM).toString(),
    })),
    transactions,
  };
}
