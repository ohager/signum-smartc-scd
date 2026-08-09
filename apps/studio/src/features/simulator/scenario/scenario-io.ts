import type { ScenarioFile } from "./scenario.types";

export function defaultScenario(): ScenarioFile {
  return {
    version: 1,
    contract: { creator: "creator", activationAmount: "1_0000_0000" },
    accounts: [{ id: "alice", balance: "100_0000_0000" }],
    timeline: [{ type: "tx", sender: "alice", amount: "5_0000_0000" }],
  };
}

export type ValidationResult =
  | { valid: true; scenario: ScenarioFile }
  | { valid: false; errors: string[] };

const isStr = (v: unknown): v is string => typeof v === "string";

export function validateScenario(value: unknown): ValidationResult {
  const errors: string[] = [];
  const v = value as any;
  if (!v || typeof v !== "object") return { valid: false, errors: ["not an object"] };
  if (v.version !== 1) errors.push("version must be 1");
  if (!v.contract || !isStr(v.contract.creator) || !isStr(v.contract.activationAmount))
    errors.push("contract.creator and contract.activationAmount must be strings");
  if (!Array.isArray(v.accounts)) errors.push("accounts must be an array");
  else v.accounts.forEach((a: any, i: number) => {
    if (!isStr(a?.id) || !isStr(a?.balance)) errors.push(`accounts[${i}] needs string id and balance`);
  });
  if (!Array.isArray(v.timeline)) errors.push("timeline must be an array");
  else v.timeline.forEach((e: any, i: number) => {
    if (e?.type === "tx") {
      if (!isStr(e.sender) || !isStr(e.amount)) errors.push(`timeline[${i}] tx needs string sender and amount`);
    } else if (e?.type === "blocks") {
      if (typeof e.count !== "number" || e.count < 1) errors.push(`timeline[${i}] blocks needs count >= 1`);
    } else errors.push(`timeline[${i}] has unknown type`);
  });
  return errors.length ? { valid: false, errors } : { valid: true, scenario: value as ScenarioFile };
}

export function parseScenario(json: string): ScenarioFile {
  const parsed = JSON.parse(json);
  const r = validateScenario(parsed);
  if (!r.valid) throw new Error("Invalid scenario: " + r.errors.join("; "));
  return r.scenario;
}

export function serializeScenario(scenario: ScenarioFile): string {
  return JSON.stringify(scenario, null, 2);
}
