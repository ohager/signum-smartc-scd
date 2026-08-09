import JSON5 from "json5";
import type { ScenarioFile } from "./scenario.types";

export function defaultScenario(): ScenarioFile {
  return {
    version: 2,
    creator: "555",
    accounts: [{ id: "1001", balance: "100_0000_0000" }],
    transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000", message: "activate" }],
  };
}

export type ValidationResult =
  | { valid: true; scenario: ScenarioFile }
  | { valid: false; errors: string[] };

// numeric bigint string: digits + optional "_" separators, at least one digit
const isNum = (v: unknown): v is string => typeof v === "string" && /^[0-9_]+$/.test(v) && /[0-9]/.test(v);

export function validateScenario(value: unknown): ValidationResult {
  const errors: string[] = [];
  const v = value as any;
  if (!v || typeof v !== "object") return { valid: false, errors: ["not an object"] };
  if (v.version !== 2) errors.push("version must be 2");
  if (!isNum(v.creator)) errors.push("creator must be a numeric account id");
  if (!Array.isArray(v.accounts)) errors.push("accounts must be an array");
  else
    v.accounts.forEach((a: any, i: number) => {
      if (!isNum(a?.id) || !isNum(a?.balance)) errors.push(`accounts[${i}] needs numeric id and balance`);
    });
  if (!Array.isArray(v.transactions)) errors.push("transactions must be an array");
  else
    v.transactions.forEach((t: any, i: number) => {
      if (typeof t?.block !== "number" || !Number.isInteger(t.block) || t.block < 1)
        errors.push(`transactions[${i}] needs an integer block >= 1`);
      if (!isNum(t?.sender) || !isNum(t?.amount)) errors.push(`transactions[${i}] needs numeric sender and amount`);
      if (t?.txId !== undefined && !isNum(t.txId)) errors.push(`transactions[${i}] txId must be numeric`);
      if (t?.message !== undefined && typeof t.message !== "string") errors.push(`transactions[${i}] message must be a string`);
    });
  return errors.length ? { valid: false, errors } : { valid: true, scenario: value as ScenarioFile };
}

export function parseScenario(json: string): ScenarioFile {
  const parsed = JSON5.parse(json); // JSON5: comments, trailing commas, unquoted keys
  const r = validateScenario(parsed);
  if (!r.valid) throw new Error("Invalid scenario: " + r.errors.join("; "));
  return r.scenario;
}

export function serializeScenario(scenario: ScenarioFile): string {
  return JSON.stringify(scenario, null, 2);
}
