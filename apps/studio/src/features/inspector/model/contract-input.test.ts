import { describe, expect, it } from "bun:test";
import { Address } from "@signumjs/core";
import { parseContractId } from "./contract-input";

describe("parseContractId", () => {
  it("accepts numeric ids and RS addresses", () => {
    expect(parseContractId(" 10904650711172151453 ")).toBe("10904650711172151453");
    const rs = Address.fromNumericId("12345", "TS").getReedSolomonAddress();
    expect(parseContractId(rs)).toBe("12345");
    expect(parseContractId("hello")).toBeNull();
    expect(parseContractId("")).toBeNull();
  });
});
