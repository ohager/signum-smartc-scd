
interface AsmFunction {
  apiCode: number;
  opCode: number;
  description?: string;
  params?: number; // Number of parameters
}

export const AsmFunctions: Record<string, AsmFunction> = {
  get_A1: { apiCode: 0x0100, opCode: 0x35, params: 0 },
  get_A2: { apiCode: 0x0101, opCode: 0x35, params: 0 },
  get_A3: { apiCode: 0x0102, opCode: 0x35, params: 0 },
  get_A4: { apiCode: 0x0103, opCode: 0x35, params: 0 },
  get_B1: { apiCode: 0x0104, opCode: 0x35, params: 0 },
  get_B2: { apiCode: 0x0105, opCode: 0x35, params: 0 },
  get_B3: { apiCode: 0x0106, opCode: 0x35, params: 0 },
  get_B4: { apiCode: 0x0107, opCode: 0x35, params: 0 },
  set_A1: { apiCode: 0x0110, opCode: 0x33, params: 1 },
  set_A2: { apiCode: 0x0111, opCode: 0x33, params: 1 },
  set_A3: { apiCode: 0x0112, opCode: 0x33, params: 1 },
  set_A4: { apiCode: 0x0113, opCode: 0x33, params: 1 },
  set_A1_A2: { apiCode: 0x0114, opCode: 0x34, params: 2 },
  set_A3_A4: { apiCode: 0x0115, opCode: 0x34, params: 2 },
  set_B1: { apiCode: 0x0116, opCode: 0x33, params: 1 },
  set_B2: { apiCode: 0x0117, opCode: 0x33, params: 1 },
  set_B3: { apiCode: 0x0118, opCode: 0x33, params: 1 },
  set_B4: { apiCode: 0x0119, opCode: 0x33, params: 1 },
  set_B1_B2: { apiCode: 0x011a, opCode: 0x34, params: 2 },
  set_B3_B4: { apiCode: 0x011b, opCode: 0x34, params: 2 },
  clear_A: { apiCode: 0x0120, opCode: 0x32, params: 0 },
  clear_B: { apiCode: 0x0121, opCode: 0x32, params: 0 },
  clear_A_B: { apiCode: 0x0122, opCode: 0x32, params: 0 },
  copy_A_From_B: { apiCode: 0x0123, opCode: 0x32, params: 0 },
  copy_B_From_A: { apiCode: 0x0124, opCode: 0x32, params: 0 },
  check_A_Is_Zero: { apiCode: 0x0125, opCode: 0x35, params: 0 },
  check_B_Is_Zero: { apiCode: 0x0126, opCode: 0x35, params: 0 },
  check_A_equals_B: { apiCode: 0x0127, opCode: 0x35, params: 0 },
  swap_A_and_B: { apiCode: 0x0128, opCode: 0x32, params: 0 },
  OR_A_with_B: { apiCode: 0x0129, opCode: 0x32, params: 0 },
  OR_B_with_A: { apiCode: 0x012a, opCode: 0x32, params: 0 },
  AND_A_with_B: { apiCode: 0x012b, opCode: 0x32, params: 0 },
  AND_B_with_A: { apiCode: 0x012c, opCode: 0x32, params: 0 },
  XOR_A_with_B: { apiCode: 0x012d, opCode: 0x32, params: 0 },
  XOR_B_with_A: { apiCode: 0x012e, opCode: 0x32, params: 0 },
  add_A_to_B: { apiCode: 0x0140, opCode: 0x32, params: 0 },
  add_B_to_A: { apiCode: 0x0141, opCode: 0x32, params: 0 },
  sub_A_from_B: { apiCode: 0x0142, opCode: 0x32, params: 0 },
  sub_B_from_A: { apiCode: 0x0143, opCode: 0x32, params: 0 },
  mul_A_by_B: { apiCode: 0x0144, opCode: 0x32, params: 0 },
  mul_B_by_A: { apiCode: 0x0145, opCode: 0x32, params: 0 },
  div_A_by_B: { apiCode: 0x0146, opCode: 0x32, params: 0 },
  div_B_by_A: { apiCode: 0x0147, opCode: 0x32, params: 0 },
  MD5_A_to_B: { apiCode: 0x0200, opCode: 0x32, params: 0 },
  check_MD5_A_with_B: { apiCode: 0x0201, opCode: 0x35, params: 0 },
  HASH160_A_to_B: { apiCode: 0x0202, opCode: 0x32, params: 0 },
  check_HASH160_A_with_B: { apiCode: 0x0203, opCode: 0x35, params: 0 },
  SHA256_A_to_B: { apiCode: 0x0204, opCode: 0x32, params: 0 },
  check_SHA256_A_with_B: { apiCode: 0x0205, opCode: 0x35, params: 0 },
  Check_Sig_B_With_A: { apiCode: 0x0206, opCode: 0x35, params: 0 },
  get_Block_Timestamp: { apiCode: 0x0300, opCode: 0x35, params: 0 },
  get_Creation_Timestamp: { apiCode: 0x0301, opCode: 0x35, params: 0 },
  get_Last_Block_Timestamp: { apiCode: 0x0302, opCode: 0x35, params: 0 },
  put_Last_Block_Hash_In_A: { apiCode: 0x0303, opCode: 0x32, params: 0 },
  A_to_Tx_after_Timestamp: { apiCode: 0x0304, opCode: 0x33, params: 1 },
  get_Type_for_Tx_in_A: { apiCode: 0x0305, opCode: 0x35, params: 0 },
  get_Amount_for_Tx_in_A: { apiCode: 0x0306, opCode: 0x35, params: 0 },
  get_Timestamp_for_Tx_in_A: { apiCode: 0x0307, opCode: 0x35, params: 0 },
  get_Ticket_Id_for_Tx_in_A: { apiCode: 0x0308, opCode: 0x35, params: 0 },
  message_from_Tx_in_A_to_B: { apiCode: 0x0309, opCode: 0x32, params: 0 },
  B_to_Address_of_Tx_in_A: { apiCode: 0x030a, opCode: 0x32, params: 0 },
  B_to_Address_of_Creator: { apiCode: 0x030b, opCode: 0x32, params: 0 },
  Get_Code_Hash_Id: { apiCode: 0x030c, opCode: 0x35, params: 0 },
  B_To_Assets_Of_Tx_In_A: { apiCode: 0x030d, opCode: 0x32, params: 0 },
  get_Current_Balance: { apiCode: 0x0400, opCode: 0x35, params: 0 },
  get_Previous_Balance: { apiCode: 0x0401, opCode: 0x35, params: 0 },
  send_to_Address_in_B: { apiCode: 0x0402, opCode: 0x33, params: 1 },
  send_All_to_Address_in_B: { apiCode: 0x0403, opCode: 0x32, params: 0 },
  send_Old_to_Address_in_B: { apiCode: 0x0404, opCode: 0x32, params: 0 },
  send_A_to_Address_in_B: { apiCode: 0x0405, opCode: 0x32, params: 0 },
  add_Minutes_to_Timestamp: { apiCode: 0x0406, opCode: 0x37, params: 2 },
  Get_Map_Value_Keys_In_A: { apiCode: 0x0407, opCode: 0x35, params: 0 },
  Set_Map_Value_Keys_In_A: { apiCode: 0x0408, opCode: 0x32, params: 0 },
  Issue_Asset: { apiCode: 0x0409, opCode: 0x35, params: 0 },
  Mint_Asset: { apiCode: 0x040a, opCode: 0x32, params: 0 },
  Distribute_To_Asset_Holders: { apiCode: 0x040b, opCode: 0x32, params: 0 },
  Get_Asset_Holders_Count: { apiCode: 0x040c, opCode: 0x35, params: 0 },
  Get_Activation_Fee: { apiCode: 0x040d, opCode: 0x35, params: 0 },
  Put_Last_Block_GSig_In_A: { apiCode: 0x040e, opCode: 0x32, params: 0 },
  Get_Asset_Circulating: { apiCode: 0x040f, opCode: 0x35, params: 0 },
  Get_Account_Balance: { apiCode: 0x0410, opCode: 0x35, params: 0 }
};

/**
 * Creates completion items for the Monaco editor with resolved opcodes
 * @param range The range where the completion items will be inserted
 * @param monaco The Monaco editor instance
 * @returns An array of completion items for API functions
 */
export function createApiFunctionCompletionItems(range: any, monaco: any) {
  return Object.entries(AsmFunctions).map(([funcName, details]) => {
    // Create parameter placeholders for the snippet
    let snippetText = funcName;

    if (details.params && details.params > 0) {
      snippetText += " ";
      // Create placeholders for each parameter
      for (let i = 0; i < details.params; i++) {
        if (i > 0) snippetText += ", ";
        snippetText += `\${${i + 1}:param${i + 1}}`;
      }
      snippetText += " ";
    }

    // Format hexadecimal values with leading zeros and '0x' prefix
    const apiCodeHex = "0x" + details.apiCode.toString(16).padStart(4, '0');
    const opCodeHex = "0x" + details.opCode.toString(16).padStart(2, '0');

    // Create description for the function based on opCode
    let functionType = "";
    switch (details.opCode) {
      case 0x32: functionType = "Void function"; break;
      case 0x33: functionType = "One parameter function"; break;
      case 0x34: functionType = "Two parameter function"; break;
      case 0x35: functionType = "Return value function"; break;
      case 0x37: functionType = "Special function"; break;
      default: functionType = "Unknown function type";
    }

    // Build placeholder text for the function call in the detail
    let funcCallText = funcName;
    if (details.params && details.params > 0) {
      funcCallText += "(";
      for (let i = 0; i < details.params; i++) {
        if (i > 0) funcCallText += ", ";
        funcCallText += "param" + (i + 1);
      }
      funcCallText += ")";
    }

    return {
      label: funcName,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: snippetText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range: range,
      detail: `API Function ${funcCallText}  [API Code: ${apiCodeHex}]`,
      documentation: {
        value: `**${funcName}**\n\nAPI Code: ${apiCodeHex}\nOperation Code: ${opCodeHex}\nType: ${functionType}`,
        isTrusted: true
      }
    };
  });
}



/**
 * Creates completion items specifically for FUN or API calls
 * This will list all API functions when typing FUN or API
 * @param range The range where the completion items will be inserted
 * @param monaco The Monaco editor instance
 * @returns An array of completion items for API function calls
 */
export function createFunctionCallCompletionItems(range: any, monaco: any) {
  return Object.entries(AsmFunctions).map(([funcName, details]) => {
    // Format hexadecimal values with leading zeros
    const apiCodeHex = "0x" + details.apiCode.toString(16).padStart(4, '0');

    // Create the insertion text with proper formatting
    // When selecting an API function after typing FUN, this will insert:
    // FUN funcName (or its API code)
    const snippetText = `${apiCodeHex} ` +
      (details.params && details.params > 0
        ? "${1:value}" + (details.params > 1 ? " ${2:value}" : "")
        : "");

    // Build placeholder text for the function call in the detail
    let funcCallText = funcName;
    if (details.params && details.params > 0) {
      funcCallText += "(";
      for (let i = 0; i < details.params; i++) {
        if (i > 0) funcCallText += ", ";
        funcCallText += "param" + (i + 1);
      }
      funcCallText += ")";
    }

    return {
      label: funcName,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: snippetText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      range: range,
      detail: `FUN ${apiCodeHex} - ${funcCallText}`,
      documentation: {
        value: `**${funcName}**\n\nAPI Code: ${apiCodeHex}\nOperation Code: 0x${details.opCode.toString(16).padStart(2, '0')}\nParameters: ${details.params || 0}`,
        isTrusted: true
      },
      sortText: funcName // Sorting by name for consistency
    };
  });
}
