import type { DebugStatus } from "../engine/engine.types";
import { t } from "@/i18n/runtime";

export interface Transport {
  /** The primary verb. The first move of a round starts it; later ones resume. */
  runLabel: "Start" | "Continue";
  runDisabled: boolean;
  canStep: boolean;
  /** Which button carries the weight while the contract is in this state. */
  emphasise: "run" | "forge";
  /** Why the contract will not move. Empty when it will. */
  note: string;
}

/**
 * What the transport offers, given where the contract stands.
 *
 * `finished` is the one worth being careful about. In the AT it means "done
 * for this round", not "dead": the contract runs again when the next block is
 * forged. The toolbar used to read it as terminal — Continue and Step greyed
 * out, nothing said — which looks like a dead end, and looks worst when a
 * breakpoint sits on the line the instruction pointer returns to at the end of
 * a round. The editor marks that line, so it reads as a clean stop the tool
 * then refuses to resume from.
 *
 * `hasMoved` is the session's own knowledge, not the machine's: a contract is
 * activated and already "running" before anyone has pressed anything, so the
 * status alone cannot tell a first run from a resumption.
 */
export function transportFor(
  status: DebugStatus,
  hasMoved: boolean,
): Transport {
  const runLabel = hasMoved ? "Continue" : "Start";

  if (status === "error") {
    return {
      runLabel,
      runDisabled: true,
      canStep: false,
      // Forging another block will not revive a halted contract.
      emphasise: "run",
      note: t("simulator.transport.halted"),
    };
  }

  if (status === "finished" || status === "stopped") {
    return {
      runLabel,
      runDisabled: true,
      canStep: false,
      emphasise: "forge",
      note: t("simulator.transport.roundOver"),
    };
  }

  return {
    runLabel,
    runDisabled: false,
    canStep: true,
    emphasise: "run",
    note: "",
  };
}
