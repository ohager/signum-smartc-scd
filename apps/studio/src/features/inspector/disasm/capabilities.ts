import type { Xrefs } from "./xrefs";

/**
 * What a contract can do, read from its API calls — the bytecode, never a
 * label someone wrote. "Can this contract move funds?" should not depend on
 * whether a Label Map tells the truth.
 */

export type Capability = "sendsFunds" | "assets" | "writesMaps" | "readsMaps" | "readsBalances" | "crypto";

// i18n-ignore — API function names
export const CAPABILITY_APIS: Record<Capability, readonly string[]> = {
  sendsFunds: ["send_to_Address_in_B", "send_All_to_Address_in_B", "send_Old_to_Address_in_B", "send_A_to_Address_in_B"],
  assets: ["Issue_Asset", "Mint_Asset", "Distribute_To_Asset_Holders"],
  writesMaps: ["Set_Map_Value_Keys_In_A"],
  readsMaps: ["Get_Map_Value_Keys_In_A"],
  readsBalances: ["Get_Account_Balance", "Get_Asset_Holders_Count", "Get_Asset_Circulating"],
  crypto: [
    "MD5_A_to_B", "check_MD5_A_with_B", "HASH160_A_to_B", "check_HASH160_A_with_B",
    "SHA256_A_to_B", "check_SHA256_A_with_B", "Check_Sig_B_With_A",
  ],
};

export function capabilities(xrefs: Xrefs): { capability: Capability; apis: string[]; sites: number[] }[] {
  return (Object.keys(CAPABILITY_APIS) as Capability[])
    .map((capability) => {
      const apis = CAPABILITY_APIS[capability].filter((name) => xrefs.api.has(name));
      const sites = apis.flatMap((name) => xrefs.api.get(name)!).sort((a, b) => a - b);
      return { capability, apis, sites };
    })
    .filter((c) => c.apis.length > 0);
}
