import { describe, it, expect } from "bun:test";
import { HttpError } from "@signumjs/http";
import {
  summariseContracts,
  hasSettled,
  DEPLOYMENT_PAGE_SIZE,
} from "./use-deployment-count";

const at = (creator: string) => ({ creator, at: "1", atRS: "S-1" }) as any;

describe("summariseContracts", () => {
  it("reports nothing deployed for an empty answer", () => {
    expect(summariseContracts([], "123")).toEqual({
      state: "answered",
      total: 0,
      mine: 0,
      capped: false,
    });
  });

  it("counts the instances", () => {
    expect(summariseContracts([at("9"), at("8")], "123").total).toBe(2);
  });

  it("counts the ones the connected account created", () => {
    const summary = summariseContracts([at("123"), at("8"), at("123")], "123");
    expect(summary.mine).toBe(2);
  });

  it("counts none as mine when no wallet account is known", () => {
    expect(summariseContracts([at("123")], undefined).mine).toBe(0);
  });

  it("marks a full page as capped, because the API returns no total", () => {
    const full = Array.from({ length: DEPLOYMENT_PAGE_SIZE }, () => at("9"));
    expect(summariseContracts(full, "123").capped).toBe(true);
  });

  it("does not mark a partial page as capped", () => {
    expect(summariseContracts([at("9")], "123").capped).toBe(false);
  });
});

describe("hasSettled", () => {
  const ledger = (getTransaction: () => Promise<unknown>) =>
    ({ transaction: { getTransaction } }) as any;

  it("keeps waiting while the transaction is only in the pool", async () => {
    expect(await hasSettled(ledger(async () => ({ transaction: "t1" })), "t1")).toBe(false);
  });

  it("is over once the transaction is in a block", async () => {
    expect(
      await hasSettled(ledger(async () => ({ transaction: "t1", block: "b1" })), "t1"),
    ).toBe(true);
  });

  it("is over when the node no longer knows the transaction", async () => {
    const unknown = new HttpError("url", 400, "Unknown transaction (Code: 5)", {
      errorCode: 5,
    });
    expect(await hasSettled(ledger(() => Promise.reject(unknown)), "t1")).toBe(true);
  });

  it("keeps waiting when the node cannot be reached", async () => {
    expect(
      await hasSettled(ledger(() => Promise.reject(new Error("offline"))), "t1"),
    ).toBe(false);
  });
});
