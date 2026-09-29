import JSON5 from "json5";
import type { ScenarioFile } from "./scenario.types";
import { t } from "@/i18n/runtime";

export function defaultScenario(): ScenarioFile {
  return {
    version: 2,
    creator: "555",
    accounts: [{ id: "1001", balance: "100_0000_0000" }],
    transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000", message: "activate" }], // i18n-ignore — scenario data
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
  if (!v || typeof v !== "object") return { valid: false, errors: [t("simulator.scenario.invalid.notObject")] };
  if (v.version !== 2) errors.push(t("simulator.scenario.invalid.version"));
  if (!isNum(v.creator)) errors.push(t("simulator.scenario.invalid.creator"));
  if (!Array.isArray(v.accounts)) errors.push(t("simulator.scenario.invalid.accounts"));
  else
    v.accounts.forEach((a: any, i: number) => {
      if (!isNum(a?.id) || !isNum(a?.balance)) errors.push(t("simulator.scenario.invalid.account", { i }));
    });
  if (!Array.isArray(v.transactions)) errors.push(t("simulator.scenario.invalid.transactions"));
  else
    v.transactions.forEach((tx: any, i: number) => {
      if (typeof tx?.block !== "number" || !Number.isInteger(tx.block) || tx.block < 1)
        errors.push(t("simulator.scenario.invalid.block", { i }));
      if (!isNum(tx?.sender) || !isNum(tx?.amount)) errors.push(t("simulator.scenario.invalid.senderAmount", { i }));
      if (tx?.txId !== undefined && !isNum(tx.txId)) errors.push(t("simulator.scenario.invalid.txId", { i }));
      if (tx?.message !== undefined && typeof tx.message !== "string") errors.push(t("simulator.scenario.invalid.message", { i }));
      if (tx?.messageHex !== undefined && typeof tx.messageHex !== "string")
        errors.push(t("simulator.scenario.invalid.messageHex", { i }));
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
