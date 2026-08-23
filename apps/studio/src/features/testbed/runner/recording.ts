export interface TestRecording {
  /** Source of the active (last-loaded) contract. */
  contractSource?: string;
  /** Every contract loaded, in order — a test may set up more than one. */
  allContractSources: string[];
  creator?: bigint;
  initializers?: Record<string, number | string | bigint>;
  /** Every transaction the test sent, in order, with effective blockheights. */
  transactions: Record<string, unknown>[];
}

type Constructable = new (...args: any[]) => any;

/**
 * Wraps `SimulatorTestbed` so a run can be replayed in the step debugger.
 *
 * Transactions are captured *after* each call, because
 * `sendTransactionAndGetResponse` stamps the current blockheight onto the
 * objects it is given — recording beforehand would save heights that are
 * still undefined.
 */
export function createRecorder(Testbed: Constructable) {
  const recording: TestRecording = { allContractSources: [], transactions: [] };

  const capture = (txs: unknown) => {
    if (!Array.isArray(txs)) return;
    for (const tx of txs) recording.transactions.push({ ...(tx as object) } as Record<string, unknown>);
  };

  class Recorded extends Testbed {
    constructor(...args: any[]) {
      super(...args);
      capture(args[0]);
    }

    loadContract(code: string, options?: { creator?: bigint; initializers?: Record<string, number | string | bigint> }) {
      recording.contractSource = code;
      recording.allContractSources.push(code);
      if (options?.creator !== undefined) recording.creator = options.creator;
      if (options?.initializers !== undefined) recording.initializers = options.initializers;
      return super.loadContract(code, options);
    }

    runScenario(txs?: unknown[]) {
      const result = super.runScenario(txs);
      capture(txs);
      return result;
    }

    sendTransactionAndGetResponse(txs: unknown[], address?: bigint) {
      const result = super.sendTransactionAndGetResponse(txs, address);
      capture(txs);
      return result;
    }
  }

  return { Recorded, recording };
}
