import type { FunctionDeclaration } from "./functions";

/**
 * The low-level API: thin C wrappers around the AT machine's API calls,
 * enabled per file with `#include APIFunctions` (and `#include
 * fixedAPIFunctions` for the `F_` variants).
 *
 * Names, return types and arities mirror `APITableTemplate` /
 * `fixedAPITableTemplate` in `smartc-signum-compiler`
 * (`dist/shaper/templates.js`); `api-functions.test.ts` diffs against them.
 * Register semantics follow `API_MICROCODE` in `smartc-signum-simulator`
 * (`dist/api.js`) and the way the compiler's own built-ins call these
 * functions (`builtinToAsm.js`).
 */
export type ApiInclude = "APIFunctions" | "fixedAPIFunctions";

export type ApiFunctionDeclaration = FunctionDeclaration & {
  /** The `#include` that makes the function known to the compiler. */
  include: ApiInclude;
};

type Param = [name: string, documentation: string];

function declare(
  include: ApiInclude,
  signature: string,
  detail: string,
  documentation: string,
  params: Param[] = [],
): ApiFunctionDeclaration {
  return {
    include,
    signature,
    detail,
    documentation: `${detail}\n\n${documentation}`.trim(),
    params: params.map(([name, doc]) => ({ name, documentation: doc })),
  };
}

const api = (
  signature: string,
  detail: string,
  documentation = "",
  params: Param[] = [],
) => declare("APIFunctions", signature, detail, documentation, params);

const fixedApi = (
  signature: string,
  detail: string,
  documentation = "",
  params: Param[] = [],
) => declare("fixedAPIFunctions", signature, detail, documentation, params);

const REGISTERS =
  "A and B are the machine's two 256-bit pseudo-registers, each split into four 64-bit slots (A1–A4, B1–B4). " +
  "API calls take at most two arguments, so everything else is passed through them.";

const AS_NUMBER =
  "The four slots are read as one unsigned 256-bit number, A1/B1 being the least significant.";

const TIMESTAMP =
  "An AT timestamp is `blockheight << 32` plus the transaction's index in that block.";

const COSTS =
  "Every API call costs 10 steps, against 1 for a regular instruction.";

function registerAccessors(): Record<string, ApiFunctionDeclaration> {
  const out: Record<string, ApiFunctionDeclaration> = {};
  for (const reg of ["A", "B"]) {
    for (const slot of [1, 2, 3, 4]) {
      const name = `${reg}${slot}`;
      out[`Get_${name}`] = api(
        `long Get_${name}()`,
        `Returns the value of register slot ${name}.`,
        REGISTERS,
      );
      out[`Set_${name}`] = api(
        `void Set_${name}(long ${name.toLowerCase()})`,
        `Stores a value in register slot ${name}.`,
        REGISTERS,
        [[name.toLowerCase(), `New value for ${name}.`]],
      );
    }
    for (const [first, second] of [
      [1, 2],
      [3, 4],
    ]) {
      const a = `${reg}${first}`;
      const b = `${reg}${second}`;
      out[`Set_${a}_${b}`] = api(
        `void Set_${a}_${b}(long ${a.toLowerCase()}, long ${b.toLowerCase()})`,
        `Stores two values in ${a} and ${b} with a single API call.`,
        `Half the cost of calling \`Set_${a}\` and \`Set_${b}\` separately. ${COSTS}`,
        [
          [a.toLowerCase(), `New value for ${a}.`],
          [b.toLowerCase(), `New value for ${b}.`],
        ],
      );
    }
  }
  return out;
}

function fixedRegisterAccessors(): Record<string, ApiFunctionDeclaration> {
  const out: Record<string, ApiFunctionDeclaration> = {};
  for (const reg of ["A", "B"]) {
    for (const slot of [1, 2, 3, 4]) {
      const name = `${reg}${slot}`;
      out[`F_Get_${name}`] = fixedApi(
        `fixed F_Get_${name}()`,
        `Returns register slot ${name} as a fixed-point value.`,
        `Same call as \`Get_${name}\`; the raw value is read as \`fixed\` (1.0 = 1_0000_0000).`,
      );
      out[`F_Set_${name}`] = fixedApi(
        `void F_Set_${name}(fixed ${name.toLowerCase()})`,
        `Stores a fixed-point value in register slot ${name}.`,
        `Same call as \`Set_${name}\`; the \`fixed\` value is stored as its raw 64-bit content.`,
        [[name.toLowerCase(), `New value for ${name}.`]],
      );
    }
  }
  return out;
}

/** Enabled with `#include APIFunctions`. */
export const SmartCApiFunctions: Record<string, ApiFunctionDeclaration> = {
  ...registerAccessors(),

  // ---- Register housekeeping ----
  Clear_A: api("void Clear_A()", "Sets all four slots of A to zero."),
  Clear_B: api("void Clear_B()", "Sets all four slots of B to zero."),
  Clear_A_And_B: api("void Clear_A_And_B()", "Sets all slots of A and B to zero."),
  Copy_A_From_B: api("void Copy_A_From_B()", "Copies B into A (A = B)."),
  Copy_B_From_A: api("void Copy_B_From_A()", "Copies A into B (B = A)."),
  Swap_A_and_B: api("void Swap_A_and_B()", "Exchanges the contents of A and B."),
  Check_A_Is_Zero: api(
    "long Check_A_Is_Zero()",
    "Returns 1 if all four slots of A are zero, otherwise 0.",
  ),
  Check_B_Is_Zero: api(
    "long Check_B_Is_Zero()",
    "Returns 1 if all four slots of B are zero, otherwise 0.",
  ),
  Check_A_Equals_B: api(
    "long Check_A_Equals_B()",
    "Returns 1 if A and B hold the same four values, otherwise 0.",
  ),

  // ---- Bitwise, slot by slot ----
  OR_A_with_B: api("void OR_A_with_B()", "A = A | B, slot by slot."),
  OR_B_with_A: api("void OR_B_with_A()", "B = B | A, slot by slot."),
  AND_A_with_B: api("void AND_A_with_B()", "A = A & B, slot by slot."),
  AND_B_with_A: api("void AND_B_with_A()", "B = B & A, slot by slot."),
  XOR_A_with_B: api("void XOR_A_with_B()", "A = A ^ B, slot by slot."),
  XOR_B_with_A: api("void XOR_B_with_A()", "B = B ^ A, slot by slot."),

  // ---- 256-bit arithmetic ----
  Add_A_To_B: api("void Add_A_To_B()", "B = A + B, as 256-bit numbers.", AS_NUMBER),
  Add_B_To_A: api("void Add_B_To_A()", "A = A + B, as 256-bit numbers.", AS_NUMBER),
  Sub_A_From_B: api("void Sub_A_From_B()", "B = B - A, as 256-bit numbers.", AS_NUMBER),
  Sub_B_From_A: api("void Sub_B_From_A()", "A = A - B, as 256-bit numbers.", AS_NUMBER),
  Mul_A_By_B: api("void Mul_A_By_B()", "B = A * B, as 256-bit numbers.", AS_NUMBER),
  Mul_B_By_A: api("void Mul_B_By_A()", "A = A * B, as 256-bit numbers.", AS_NUMBER),
  Div_A_By_B: api(
    "void Div_A_By_B()",
    "B = A / B, as 256-bit numbers.",
    `${AS_NUMBER} If B is zero, nothing changes.`,
  ),
  Div_B_By_A: api(
    "void Div_B_By_A()",
    "A = B / A, as 256-bit numbers.",
    `${AS_NUMBER} If A is zero, nothing changes.`,
  ),

  // ---- Hashes and signatures ----
  MD5_A_To_B: api(
    "void MD5_A_To_B()",
    "Hashes A1–A2 (16 bytes) with MD5 and stores the digest in B1–B2.",
  ),
  Check_MD5_A_With_B: api(
    "long Check_MD5_A_With_B()",
    "Returns 1 if the MD5 of A1–A2 equals B1–B2, otherwise 0.",
  ),
  HASH160_A_To_B: api(
    "void HASH160_A_To_B()",
    "Hashes A (32 bytes) with RIPEMD-160 and stores the 20-byte digest in B1, B2 and the low 32 bits of B3.",
  ),
  Check_HASH160_A_With_B: api(
    "long Check_HASH160_A_With_B()",
    "Returns 1 if the RIPEMD-160 of A equals B1, B2 and the low 32 bits of B3, otherwise 0.",
  ),
  SHA256_A_To_B: api(
    "void SHA256_A_To_B()",
    "Hashes A (32 bytes) with SHA-256 and stores the digest in B.",
  ),
  Check_SHA256_A_With_B: api(
    "long Check_SHA256_A_With_B()",
    "Returns 1 if the SHA-256 of A equals B, otherwise 0.",
  ),
  Check_Sig_B_With_A: api(
    "long Check_Sig_B_With_A()",
    "Verifies an account's signature over a message; returns 1 if valid, otherwise 0.",
    "Inputs:\n" +
      "* A1: transaction id holding the signature\n" +
      "* A2: message page where the signature starts (it spans `page` and `page+1`)\n" +
      "* A3: account id of the signer\n" +
      "* B2–B4: the signed message (B1 is not used)\n\n" +
      "The built-in `checkSignature()` sets these registers for you.",
  ),

  // ---- Blocks and timestamps ----
  Get_Block_Timestamp: api(
    "long Get_Block_Timestamp()",
    "Returns the timestamp of the current block.",
    `${TIMESTAMP} \`Get_Block_Timestamp() >> 32\` is the current block height.`,
  ),
  Get_Creation_Timestamp: api(
    "long Get_Creation_Timestamp()",
    "Returns the timestamp of the block in which this contract was created.",
    TIMESTAMP,
  ),
  Get_Last_Block_Timestamp: api(
    "long Get_Last_Block_Timestamp()",
    "Returns the timestamp of the previous block.",
    TIMESTAMP,
  ),
  Put_Last_Block_Hash_In_A: api(
    "void Put_Last_Block_Hash_In_A()",
    "Loads the hash of the previous block into A.",
  ),
  Put_Last_Block_GSig_In_A: api(
    "void Put_Last_Block_GSig_In_A()",
    "Loads the generation signature of the previous block into A.",
    "This is the entropy behind `getWeakRandomNumber()`, which returns A2 after this call. " +
      "Block forgers can influence it, so do not rely on it for anything of value.",
  ),
  Add_Minutes_To_Timestamp: api(
    "long Add_Minutes_To_Timestamp(long timestamp, long minutes)",
    "Returns 'timestamp' moved forward by 'minutes'.",
    `${TIMESTAMP} Blocks are counted as 4 minutes each, so the result advances by \`minutes / 4\` blocks.`,
    [
      ["timestamp", "AT timestamp to start from."],
      ["minutes", "Minutes to add; converted to blocks of 4 minutes."],
    ],
  ),

  // ---- Incoming transactions ----
  A_To_Tx_After_Timestamp: api(
    "void A_To_Tx_After_Timestamp(long timestamp)",
    "Finds the first transaction to this contract after 'timestamp' and puts its id in A1.",
    `${TIMESTAMP} A is cleared first, so A1 is 0 if there is no such transaction. ` +
      "The built-ins `getNextTx()` and `getNextTxFromBlockheight()` are built on this call.",
    [["timestamp", "AT timestamp to search after."]],
  ),
  Get_Type_For_Tx_In_A: api(
    "long Get_Type_For_Tx_In_A()",
    "Returns the type of the transaction whose id is in A1.",
    "Returns -1 if A1 is not a valid transaction.",
  ),
  Get_Amount_For_Tx_In_A: api(
    "long Get_Amount_For_Tx_In_A()",
    "Returns the amount the transaction in A1 carries.",
    "Inputs:\n" +
      "* A1: transaction id\n" +
      "* A2: asset id, or 0 for Signa\n\n" +
      "For Signa, the contract's activation amount is already subtracted. Returns -1 if A1 is not a valid transaction.",
  ),
  Get_Timestamp_For_Tx_In_A: api(
    "long Get_Timestamp_For_Tx_In_A()",
    "Returns the timestamp of the transaction whose id is in A1.",
    `${TIMESTAMP} Returns -1 if A1 is not a valid transaction.`,
  ),
  Get_Random_Id_For_Tx_In_A: api(
    "long Get_Random_Id_For_Tx_In_A()",
    "Returns a random number derived from the transaction in A1.",
    "The value is only available 15 blocks after the transaction was included. If called earlier, the contract " +
      "**sleeps** until then. Returns -1 if A1 is not a valid transaction.",
  ),
  Message_From_Tx_In_A_To_B: api(
    "void Message_From_Tx_In_A_To_B()",
    "Loads one 32-byte page of the transaction's message into B.",
    "Inputs:\n" +
      "* A1: transaction id\n" +
      "* A2: page number, starting at 0\n\n" +
      "Missing message bytes read as zero; an invalid transaction clears B. `readMessage()` wraps this call.",
  ),
  B_To_Address_Of_Tx_In_A: api(
    "void B_To_Address_Of_Tx_In_A()",
    "Puts the sender of the transaction in A1 into B1.",
    "B2–B4 are cleared. `getSender()` wraps this call.",
  ),
  B_To_Assets_Of_Tx_In_A: api(
    "void B_To_Assets_Of_Tx_In_A()",
    "Puts the ids of the assets sent with the transaction in A1 into B1–B4.",
    "A transaction carries at most four assets; unused slots are 0. `readAssets()` wraps this call.",
  ),
  B_To_Address_Of_Creator: api(
    "void B_To_Address_Of_Creator()",
    "Puts the creator of a contract into B1.",
    "Input: B2 holds the contract id, or 0 for this contract. The other slots of B are cleared. " +
      "`getCreator()` and `getCreatorOf()` wrap this call.",
  ),

  // ---- Balances and sending ----
  Get_Current_Balance: api(
    "long Get_Current_Balance()",
    "Returns this contract's current balance.",
    "Input: B2 holds an asset id, or 0 for the Signa balance (in NQT).",
  ),
  Get_Previous_Balance: api(
    "long Get_Previous_Balance()",
    "Returns this contract's Signa balance from before the current run.",
  ),
  Get_Account_Balance: api(
    "long Get_Account_Balance()",
    "Returns the balance of any account.",
    "Inputs:\n* B1: account id\n* B2: asset id, or 0 for Signa (in NQT)\n\n" +
      "`getAccountBalance()` and `getAccountQuantity()` wrap this call.",
  ),
  Send_To_Address_In_B: api(
    "void Send_To_Address_In_B(long amount)",
    "Sends 'amount' to the account in B1.",
    "Inputs:\n" +
      "* B1: recipient\n" +
      "* B2: asset id, or 0 to send Signa\n" +
      "* B3: when sending an asset, Signa (NQT) to send along with it\n\n" +
      "Amounts larger than the balance are capped to it; zero or negative amounts send nothing.",
    [["amount", "NQT when sending Signa, otherwise the asset quantity."]],
  ),
  Send_All_To_Address_In_B: api(
    "void Send_All_To_Address_In_B()",
    "Sends the contract's entire Signa balance to the account in B1.",
  ),
  Send_Old_To_Address_In_B: api(
    "void Send_Old_To_Address_In_B()",
    "Sends the Signa balance from before the current run to the account in B1.",
    "Capped to the current balance.",
  ),
  Send_A_To_Address_In_B: api(
    "void Send_A_To_Address_In_B()",
    "Sends the 32 bytes in A as a message to the account in B1.",
    "Several calls to the same recipient in one run are joined into one message. `sendMessage()` wraps this call.",
  ),

  // ---- Contracts and maps ----
  Get_Code_Hash_Id: api(
    "long Get_Code_Hash_Id()",
    "Returns the code hash id of a contract.",
    "Input: B2 holds the contract id, or 0 for this contract. Returns 0 if the contract is unknown. " +
      "`getCodeHashOf()` wraps this call.",
  ),
  Get_Activation_Fee: api(
    "long Get_Activation_Fee()",
    "Returns the activation amount (NQT) of a contract.",
    "Input: B2 holds the contract id, or 0 for this contract. Returns 0 if the contract is unknown. " +
      "`getActivationOf()` wraps this call.",
  ),
  Get_Map_Value_Keys_In_A: api(
    "long Get_Map_Value_Keys_In_A()",
    "Reads a value from a contract's key-key-value map.",
    "Inputs:\n* A1: key1\n* A2: key2\n* A3: contract id, or 0 for this contract\n\n" +
      "Returns 0 for a missing entry. `getMapValue()` and `getExtMapValue()` wrap this call.",
  ),
  Set_Map_Value_Keys_In_A: api(
    "void Set_Map_Value_Keys_In_A()",
    "Writes a value into this contract's key-key-value map.",
    "Inputs:\n* A1: key1\n* A2: key2\n* A4: value (A3 is not used)\n\n`setMapValue()` wraps this call.",
  ),

  // ---- Assets ----
  Issue_Asset: api(
    "long Issue_Asset()",
    "Issues a new asset owned by this contract and returns its id.",
    "Inputs:\n* A1–A2: asset name, up to 10 characters\n* B1: number of decimals\n\n" +
      "The asset starts with a quantity of zero; use `Mint_Asset` to create units. `issueAsset()` wraps this call.",
  ),
  Mint_Asset: api(
    "void Mint_Asset()",
    "Creates new units of an asset issued by this contract.",
    "Inputs:\n* B1: quantity\n* B2: asset id\n\n" +
      "Does nothing for an asset this contract did not issue. `mintAsset()` wraps this call.",
  ),
  Distribute_To_Asset_Holders: api(
    "void Distribute_To_Asset_Holders()",
    "Distributes Signa and/or an asset to the holders of an asset, in proportion to their holdings.",
    "Inputs:\n" +
      "* B1: minimum quantity a holder needs to take part\n" +
      "* B2: asset whose holders receive the distribution\n" +
      "* A1: Signa (NQT) to distribute\n" +
      "* A3: asset to distribute, or 0 for none\n" +
      "* A4: quantity of that asset to distribute\n\n" +
      "Amounts are capped to what the contract holds. `distributeToHolders()` wraps this call.",
  ),
  Get_Asset_Holders_Count: api(
    "long Get_Asset_Holders_Count()",
    "Returns how many accounts hold at least a minimum quantity of an asset.",
    "Inputs:\n* B1: minimum quantity\n* B2: asset id\n\n`getAssetHoldersCount()` wraps this call.",
  ),
  Get_Asset_Circulating: api(
    "long Get_Asset_Circulating()",
    "Returns the circulating supply of an asset.",
    "Input: B2 holds the asset id. Returns 0 for asset id 0. `getAssetCirculating()` wraps this call.",
  ),
};

/** Enabled with `#include fixedAPIFunctions`: `fixed`-typed twins of the calls that move Signa amounts. */
export const SmartCFixedApiFunctions: Record<string, ApiFunctionDeclaration> = {
  ...fixedRegisterAccessors(),
  F_Get_Amount_For_Tx_In_A: fixedApi(
    "fixed F_Get_Amount_For_Tx_In_A()",
    "Returns the amount the transaction in A1 carries, as fixed.",
    "Same call as `Get_Amount_For_Tx_In_A` (A1: transaction id, A2: asset id or 0 for Signa).",
  ),
  F_Get_Current_Balance: fixedApi(
    "fixed F_Get_Current_Balance()",
    "Returns this contract's current balance, as fixed.",
    "Same call as `Get_Current_Balance` (B2: asset id, or 0 for Signa).",
  ),
  F_Get_Previous_Balance: fixedApi(
    "fixed F_Get_Previous_Balance()",
    "Returns this contract's Signa balance from before the current run, as fixed.",
  ),
  F_Get_Account_Balance: fixedApi(
    "fixed F_Get_Account_Balance()",
    "Returns the balance of any account, as fixed.",
    "Same call as `Get_Account_Balance` (B1: account id, B2: asset id or 0 for Signa).",
  ),
  F_Send_To_Address_In_B: fixedApi(
    "void F_Send_To_Address_In_B(fixed amount)",
    "Sends 'amount' to the account in B1.",
    "Same call as `Send_To_Address_In_B` (B1: recipient, B2: asset id or 0 for Signa, B3: Signa sent with an asset).",
    [["amount", "Signa amount, e.g. 1.5."]],
  ),
  F_Get_Map_Value_Keys_In_A: fixedApi(
    "fixed F_Get_Map_Value_Keys_In_A()",
    "Reads a value from a contract's key-key-value map, as fixed.",
    "Same call as `Get_Map_Value_Keys_In_A` (A1: key1, A2: key2, A3: contract id or 0).",
  ),
  F_Get_Activation_Fee: fixedApi(
    "fixed F_Get_Activation_Fee()",
    "Returns the activation amount of a contract, as fixed.",
    "Same call as `Get_Activation_Fee` (B2: contract id, or 0 for this contract).",
  ),
};

/** Every low-level function, regardless of include — for hover and signature help. */
export const AllSmartCApiFunctions: Record<string, ApiFunctionDeclaration> = {
  ...SmartCApiFunctions,
  ...SmartCFixedApiFunctions,
};
