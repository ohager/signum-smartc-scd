export type TimelineEntry =
  | { type: "tx"; sender: string; amount: string; message?: string }
  | { type: "blocks"; count: number };

export interface ScenarioFile {
  version: 1;
  contract: { creator: string; activationAmount: string };
  accounts: { id: string; balance: string }[];
  timeline: TimelineEntry[];
}
