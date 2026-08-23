/**
 * Type declarations handed to Monaco so a test file type-checks in the editor.
 *
 * Monaco has no filesystem and cannot read node_modules, so these are strings.
 * They are a hand-written facade over the real packages, not generated from
 * them — generating from the installed `.d.ts` is a later task.
 * `TYPED_TESTBED_VERSION` is checked against the installed dependency by a
 * test, so a version bump surfaces as a failure rather than as silently stale
 * autocomplete.
 */
export const TYPED_TESTBED_VERSION = "1.2.0";

export interface AmbientLib {
  filePath: string;
  content: string;
}

const VITEST = `
declare module "vitest" {
  export interface Assertion<T = any> {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toStrictEqual(expected: T): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(n: number | bigint): void;
    toBeLessThan(n: number | bigint): void;
    toContain(item: any): void;
    toHaveLength(n: number): void;
    toMatchObject(shape: object): void;
    toThrow(expected?: string | RegExp): void;
    readonly not: Assertion<T>;
  }
  export function expect<T>(actual: T): Assertion<T>;
  export function describe(name: string, fn: () => void): void;
  export namespace describe {
    function skip(name: string, fn: () => void): void;
    function only(name: string, fn: () => void): void;
  }
  export function it(name: string, fn: () => unknown): void;
  export namespace it {
    function skip(name: string, fn: () => unknown): void;
    function only(name: string, fn: () => unknown): void;
    function todo(name: string): void;
  }
  export const test: typeof it;
  export function beforeAll(fn: () => unknown): void;
  export function afterAll(fn: () => unknown): void;
  export function beforeEach(fn: () => unknown): void;
  export function afterEach(fn: () => unknown): void;
}
`;

const TESTBED = `
declare module "signum-smartc-testbed" {
  export interface TransactionObj {
    blockheight?: number;
    amount: bigint;
    sender: bigint;
    recipient?: bigint;
    txid?: bigint;
    messageText?: string;
    messageHex?: string;
  }
  export interface BlockchainTransactionObj {
    txid: bigint;
    blockheight: number;
    amount: bigint;
    sender: bigint;
    recipient: bigint;
    messageText?: string;
    messageHex?: string;
  }
  export interface MapObj { k1: bigint; k2: bigint; value: bigint }
  export interface MemoryObj { varName: string; value: bigint }
  export interface AccountObj { id: bigint; balance: bigint }

  export interface LoadContractOptions {
    creator?: bigint;
    contractId?: bigint;
    initializers?: Record<string, number | string | bigint>;
  }

  export class SimulatorTestbed {
    constructor(scenario?: TransactionObj[]);
    /** Loads contract SOURCE (not a path) and makes it the active contract. */
    loadContract(code: string, options?: LoadContractOptions): this;
    selectContract(address: bigint): this;
    runScenario(scenario?: TransactionObj[]): this;
    getContractMemory(address?: bigint): MemoryObj[];
    getContractMemoryValue(name: string, address?: bigint): bigint | null;
    getContractMap(address?: bigint): MapObj[];
    getContractMapValue(key1: bigint, key2: bigint, address?: bigint): bigint;
    getContractMapValues(key1: bigint, address?: bigint): MapObj[];
    getAccount(accountId: bigint): AccountObj | null;
    getTransactions(): BlockchainTransactionObj[];
    getTransaction(index: number): BlockchainTransactionObj;
    getTransactionById(id: bigint): BlockchainTransactionObj | null;
    getTransactionsSentByContract(blockheight: number, address?: bigint): BlockchainTransactionObj[];
    sendTransactionAndGetResponse(transactions: TransactionObj[], address?: bigint): BlockchainTransactionObj[];
  }

  /** Encodes bigints as a hex message payload for a contract call. */
  export function asHexMessage(args: bigint[]): string;
}
`;

const RAW_IMPORTS = `
declare module "*?raw" {
  const content: string;
  export default content;
}
`;

export const AMBIENT_TYPINGS: AmbientLib[] = [
  { filePath: "file:///node_modules/@types/vitest/index.d.ts", content: VITEST },
  { filePath: "file:///node_modules/@types/signum-smartc-testbed/index.d.ts", content: TESTBED },
  { filePath: "file:///node_modules/@types/raw-imports/index.d.ts", content: RAW_IMPORTS },
];
