export type FunctionDeclaration = {
  documentation: string;
  detail: string;
  signature: string;
  params: { name: string; documentation: string }[];
};

export const SmartCFunctions: Record<string, FunctionDeclaration> = {
  getNextTx: {
    signature: "long getNextTx()",
    detail:
      "Keep track of incoming transactions and returns the next transaction Id.",
    documentation:
      "Keep track of incoming transactions and returns the next transaction Id.\n" +
      "If there is no new transaction, zero is returned.\n" +
      "A internal variable '_counterTimestamp' is used to store the last transaction received and it is updated by this function.\n" +
      "* Note:\n" +
      "If it is needed to come back to a given transaction later on, it is possible to save the contents of auto counter to another variable minus one. Later just overwrite the auto counter and then call `getNextTx` function. In this way it is possible to loop again thru all messages starting at that giving point. Example:\n" +
      "```c\n" +
      "// Save current loop point\n" +
      "currrentTransaction = getNextTx();\n" +
      "rewindPoint = _counterTimestamp - 1;\n" +
      "// ...\n" +
      "\n" +
      "// Restore loop point\n" +
      "_counterTimestamp = rewindPoint;\n" +
      "currrentTransaction = getNextTx();\n" +
      "// currrentTransaction will be the same from save point\n" +
      "// and all messages after that one can be visited again.\n" +
      "```",
    params: [],
  },
  getNextTxFromBlockheight: {
    signature: "long getNextTxFromBlockheight(long blockheight)",
    detail:
      "Returns the transaction Id of the first transaction received at block 'blockheight' or later.",
    documentation:
      "Returns the transaction Id of the first transaction received at block 'blockheight' or later.\nIf there is no transaction, zero is returned.\nThis function also sets the internal variable '_counterTimestamp' and can be used together `getNextTx`.",
    params: [
      {
        name: "blockheight",
        documentation: "",
      },
    ],
  },
  getBlockheight: {
    signature: "long getBlockheight(long transaction)",
    detail: "Returns the blockheight of 'transaction'.",
    documentation:
      "Returns the blockheight of 'transaction'.\nIf transaction is invalid, 4294967295 is returned.",
    params: [
      {
        name: "transaction",
        documentation: "transaction'.",
      },
    ],
  },
  getAmount: {
    signature: "long getAmount(long transaction)",
    detail: "",
    documentation:
      "Returns the Signa amount from 'transaction'.\n" +
      "The returned value is the original amount sent minus the activation amount from the contract.\n" +
      "If transaction is invalid, -1 is returned (-0.00000001 in fixed).",
    params: [
      {
        name: "transaction",
        documentation: "",
      },
    ],
  },
  getAmountFx: {
    signature: "fixed getAmountFx(long transaction)",
    detail: "",
    documentation:
      "Returns the Signa amount from 'transaction'.\n" +
      "The returned value is the original amount sent minus the activation amount from the contract.\n" +
      "If transaction is invalid, -1 is returned (-0.00000001 in fixed).",
    params: [
      {
        name: "transaction",
        documentation: "",
      },
    ],
  },
  getSender: {
    signature: "long getSender(long transaction)",
    detail: "Returns the sender's Id from 'transaction'.",
    documentation:
      "Returns the sender's Id from 'transaction'.\nIf transaction is invalid, 0 is returned.",
    params: [
      {
        name: "transaction",
        documentation: "",
      },
    ],
  },
  getType: {
    signature: "long getType(long transaction)",
    detail: "Returns the type from 'transaction'.",
    documentation:
      "Returns the type from 'transaction'.\nAll transactions types can be fetch at http api [getConstants](https://europe.signum.network/api-doc?requestTag=INFO).\nIf transaction is invalid, -1 is returned.",
    params: [
      {
        name: "transaction",
        documentation: "transaction'.",
      },
    ],
  },
  readMessage: {
    signature: "void readMessage(long transaction, long page, long * buffer)",
    detail:
      "Reads the incoming message from 'transaction' at 'page' and store it at 'buffer'.",
    documentation:
      "Reads the incoming message from 'transaction' at 'page' and store it at 'buffer'.\n" +
      "Each page has 32 bytes (4 longs), so the buffer size must be at least 4 longs or the function will overflow the buffer.\n" +
      "First page is 0 and there is no indicator of message size. Control the message expecting zeros after the end of message.\n" +
      "If 'page' is lower than zero or greater than 32, buffer is filled with zeros.\n" +
      "If 'transaction' is invalid or there is no message attached, buffer is filled with zeros.\n",
    params: [
      {
        name: "transaction",
        documentation: "transaction' at 'page' and store it at 'buffer'.",
      },
      {
        name: "page",
        documentation: "page' and store it at 'buffer'.",
      },
      {
        name: "buffer",
        documentation: "",
      },
    ],
  },
  readShortMessage: {
    signature:
      "void readShortMessage(long transaction, long * buffer, long length)",
    detail:
      "Reads the first 'length' longs from message of 'transaction' and store it at 'buffer'.",
    documentation:
      "Reads the first 'length' longs from message of 'transaction' and store it at 'buffer'.\n" +
      "This function only reads the message at page zero.\n" +
      "Ensure the 'buffer' is at least 'length' longs long, or the function will overflow the buffer.\n" +
      "If 'transaction' is invalid or there is no message attached, buffer is filled with zeros.\n" +
      "Limits: 0 <= length <= 4.",
    params: [
      {
        name: "transaction",
        documentation: "transaction' and store it at 'buffer'.",
      },
      {
        name: "buffer",
        documentation: "",
      },
      {
        name: "length",
        documentation:
          "'length' longs from message of 'transaction' and store it at 'buffer'.",
      },
    ],
  },
  readAssets: {
    signature: "void readAssets(long transaction, long * buffer)",
    detail:
      "Reads all assets Id (up to 4) of 'transaction' and store them at 'buffer'.",
    documentation:
      "Reads all assets Id (up to 4) of 'transaction' and store them at 'buffer'.\n" +
      "Four values will be read, so the buffer size must be at least 4 longs or the function will overflow the buffer.\n" +
      "If 'transaction' is invalid, or no assets are found, buffer is filled with zeros.\n" +
      "If less than 4 assets are found, the firsts values will have the assetId and the remaining will be zeros.\n",
    params: [
      {
        name: "transaction",
        documentation: "transaction' and store them at 'buffer'.",
      },
      {
        name: "buffer",
        documentation: "buffer'.",
      },
    ],
  },
  getQuantity: {
    signature: "long getQuantity(long transaction, long assetId)",
    detail:
      "Returns the quantity (QNT) of 'assetId' transferred in 'transaction'.",
    documentation:
      "Returns the quantity (QNT) of 'assetId' transferred in 'transaction'.\nIf transaction is invalid, -1 is returned.\nIf transaction valid and there is no asset transfers that match 'assetId', zero is returned.",
    params: [
      {
        name: "transaction",
        documentation: "transaction'.",
      },
      {
        name: "assetId",
        documentation: "assetId' transfered in 'transaction'.",
      },
    ],
  },
  sendAmount: {
    signature: "void sendAmount(long amount, long accountId)",
    detail: "",
    documentation:
      "Enqueues a transaction to send 'amount' of Signa to 'accountId'.\n" +
      "For sending Signa and Messages, only one transaction will be sent each block. The amounts are added.\n" +
      "If 'amount' is greater than contract's current balance, all balance is sent and contract halts execution (no gas).\n" +
      "No empty transactions are sent, they must send at least 1 NQT (or 0.00000001 Signa).\n",
    params: [
      {
        name: "amount",
        documentation: "Amount in NQT/Planck",
      },
      {
        name: "accountId",
        documentation: "The recipient's address",
      },
    ],
  },
  sendAmountFx: {
    signature: "void sendAmountFx(fixed amount, long accountId)",
    detail: "",
    documentation:
      "Enqueues a transaction to send 'amount' of Signa to 'accountId'.\n" +
      "For sending Signa and Messages, only one transaction will be sent each block. The amounts are added.\n" +
      "If 'amount' is greater than contract's current balance, all balance is sent and contract halts execution (no gas).\n" +
      "No empty transactions are sent, they must send at least 1 NQT (or 0.00000001 Signa).\n",
    params: [
      {
        name: "amount",
        documentation: "Amount in Signa",
      },
      {
        name: "accountId",
        documentation: "The recipient's address",
      },
    ],
  },
  sendMessage: {
    signature: "void sendMessage(long * buffer, long accountId)",
    detail:
      "Enqueues a transaction to send the content of 'buffer' as one message page (32 bytes or 4 longs) to 'accountId'.",
    documentation:
      "Enqueues a transaction to send the content of 'buffer' as one message page (32 bytes or 4 longs) to 'accountId'.\nBuffer size must be at least 4 longs or the function will overflow reading the buffer.\nIf the function is used more than once in a block, the messages are concatenated up to 992 bytes (31 pages).\nIf a 32th page is sent, the first 31 pages are disregarded and the loop restarts.\nVERIFY: Transaction is sent with empty message? A empty message is one containing only zeros.",
    params: [
      {
        name: "buffer",
        documentation:
          "buffer' as one message page (32 bytes or 4 longs) to 'accountId'.",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendShortMessage: {
    signature:
      "void sendShortMessage(long * buffer, long length, long accountId)",
    detail:
      "Enqueues a transaction to send the content of 'buffer' with 'length' as one message page (32 bytes or 4 longs) to 'accountId'.",
    documentation:
      "Enqueues a transaction to send the content of 'buffer' with 'length' as one message page (32 bytes or 4 longs) to 'accountId'.\nIf 'length' is equal or lower than 3, remaining longs are filled with zeros.\nTotal message size restriction is the same as SendMessage.\nLimits: 0 <= length <= 4.",
    params: [
      {
        name: "buffer",
        documentation:
          "buffer' with 'length' as one message page (32 bytes or 4 longs) to 'accountId'.",
      },
      {
        name: "length",
        documentation:
          "length' as one message page (32 bytes or 4 longs) to 'accountId'.",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendAmountAndMessage: {
    signature:
      "void sendAmountAndMessage(long amount, long * buffer, long accountId)",
    detail:
      "Shorthand for use `sendAmount` and `sendMessage` (optimized code). Same restrictions apply.",
    documentation:
      "Shorthand for use `sendAmount` and `sendMessage` (optimized code). Same restrictions apply.",
    params: [
      {
        name: "amount",
        documentation: "The amount in Planck",
      },
      {
        name: "buffer",
        documentation: "The message to be sent",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendAmountAndMessageFx: {
    signature:
      "void sendAmountAndMessageFx(fixed amount, long * buffer, long accountId)",
    detail:
      "Shorthand for use `sendAmount` and `sendMessage` (optimized code). Same restrictions apply.",
    documentation:
      "Shorthand for use `sendAmount` and `sendMessage` (optimized code). Same restrictions apply.",
    params: [
      {
        name: "amount",
        documentation: "The amount in Signa",
      },
      {
        name: "buffer",
        documentation: "The message to be sent",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendBalance: {
    signature: "void sendBalance(long accountId)",
    detail:
      "Enqueues a transaction to send all current balance (Signa) to 'accountId'.",
    documentation:
      "Enqueues a transaction to send all current balance (Signa) to 'accountId'.\nSame restrictions from `sendAmount` apply.\nContract will halt execution (no gas).",
    params: [
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendQuantity: {
    signature: "void sendQuantity(long quantity, long assetId, long accountId)",
    detail: "Transfers 'quantity' of 'assetId' to 'accountId'.",
    documentation:
      "Sends a transaction to transfer 'quantity' of 'assetId' to 'accountId'.\n" +
      "If contract balance of 'assetId' is lower than 'quantity', all balance of 'assetId' is sent.\n" +
      "If the same asset is transfered two times at same block, their quantities are added and only one transaction is sent.\n" +
      "Transactions from smart contracts can transfer only one asset. If two different assets are transfered in same block, two transactions will be sent.\n" +
      "No empty transactions are sent, they must transfer at least 1 QNT of some asset.",
    params: [
      {
        name: "quantity",
        documentation: "quantity' of 'assetId' to 'accountId'.",
      },
      {
        name: "assetId",
        documentation: "assetId of asset to be sent.",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendQuantityAndAmount: {
    signature:
      "void sendQuantityAndAmount(long quantity, long assetId, long amount, long accountId)",
    detail:
      "Transfer 'quantity' of 'assetId' and 'amount' of NQT to 'accountId'",
    documentation:
      "Sends a transaction to transfer 'quantity' of 'assetId' and 'amount' of NQT/Planck to 'accountId'.\n" +
      "This function ensure the asset and Signa are sent in the same transaction and with optimized code.\n" +
      "If 'quantity' is zero no transaction is sent, even if 'amount' is greater than zero.\n" +
      "If contract balance of 'assetId' is lower than 'quantity', all balance of 'assetId' is sent.\n" +
      "If contract balance is lower than 'amount', all Signa balance is sent.\n" +
      "Transactions to transfer assets can not have messages attached.\n" +
      "If the same asset is transferred two times at same block, their quantities are added and only one transaction is sent.\n" +
      "Transactions from smart contracts can transfer only one asset. If two different assets are transferred in same block, two transactions will be sent.",
    params: [
      {
        name: "quantity",
        documentation: "Asset quantity to be sent",
      },
      {
        name: "assetId",
        documentation: "Asset id of asset to be sent.",
      },
      {
        name: "amount",
        documentation: "Amount to be sent in NQT/Planck",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  sendQuantityAndAmountFx: {
    signature:
      "void sendQuantityAndAmountFx(long quantity, long assetId, fixed amount, long accountId)",
    detail:
      "Transfer 'quantity' of 'assetId' and 'amount' of Signa to 'accountId'",
    documentation:
      "Sends a transaction to transfer 'quantity' of 'assetId' and 'amount' of Signa to 'accountId'.\n" +
      "This function ensure the asset and Signa are sent in the same transaction and with optimized code.\n" +
      "If 'quantity' is zero no transaction is sent, even if 'amount' is greater than zero.\n" +
      "If contract balance of 'assetId' is lower than 'quantity', all balance of 'assetId' is sent.\n" +
      "If contract balance is lower than 'amount', all Signa balance is sent.\n" +
      "Transactions to transfer assets can not have messages attached.\n" +
      "If the same asset is transferred two times at same block, their quantities are added and only one transaction is sent.\n" +
      "Transactions from smart contracts can transfer only one asset. If two different assets are transferred in same block, two transactions will be sent.",
    params: [
      {
        name: "quantity",
        documentation: "Asset quantity to be sent",
      },
      {
        name: "assetId",
        documentation: "Asset id of asset to be sent.",
      },
      {
        name: "amount",
        documentation: "Amount to be sent in Signa",
      },
      {
        name: "accountId",
        documentation: "The recipient's address'.",
      },
    ],
  },
  getCurrentBlockheight: {
    signature: "long getCurrentBlockheight()",
    detail: "Returns the current blockheight when the instruction is executed.",
    documentation:
      "Returns the current blockheight when the instruction is executed.",
    params: [],
  },
  getWeakRandomNumber: {
    signature: "long getWeakRandomNumber()",
    detail: "Returns a simple random number based on last block signature.",
    documentation:
      "Returns a simple random number based on last block signature.\nIt is very unlikely someone to tamper this number, but it can be done in theory.\nAttention needed for contracts dealing with big amount of coins.\nReturn value can be negative, and negative number MOD positive number results in negative numbers. Hint: use shift right to get rid of negative values `positiveRnd = getWeakRandomNumber() >> 1;`.",
    params: [],
  },
  getCreator: {
    signature: "long getCreator()",
    detail: "Returns the account Id of the creator from current contract.",
    documentation:
      "Returns the account Id of the creator from current contract.",
    params: [],
  },
  getCreatorOf: {
    signature: "long getCreatorOf(long contractId)",
    detail: "Returns the account Id of the creator of 'contractId'.",
    documentation:
      "Returns the account Id of the creator of 'contractId'.\nIf 'contractId' is not a contract, zero is returned.",
    params: [
      {
        name: "contractId",
        documentation: "contractId'.",
      },
    ],
  },
  getCodeHashOf: {
    signature: "long getCodeHashOf(long contractId)",
    detail: "Returns the code hash id of 'contractId'.",
    documentation:
      "Returns the code hash id of 'contractId'.\nIf 'contractId' is zero, it is returned the code hash from the contract itself.\nIf 'contractId' is not a contract, zero is returned.",
    params: [
      {
        name: "contractId",
        documentation: "contractId'.",
      },
    ],
  },
  getActivationOf: {
    signature: "long getActivationOf(long contractId)",
    detail:
      "Returns the minimum amount of NQT/Planck needed activate 'contractId'",
    documentation:
      "Returns the minimum amount of NQT/Planck needed activate 'contractId'.\n" +
      "If 'contractId' is zero, it is returned the minimum activation amount from the contract itself.\n" +
      "If 'contractId' is not a contract, zero is returned.",
    params: [
      {
        name: "contractId",
        documentation: "The target contract",
      },
    ],
  },
  getActivationOfFx: {
    signature: "long getActivationOfFx(long contractId)",
    detail: "Returns the minimum amount of Signa needed activate 'contractId'",
    documentation:
      "Returns the minimum amount of Signa needed activate 'contractId'.\n" +
      "If 'contractId' is zero, it is returned the minimum activation amount from the contract itself.\n" +
      "If 'contractId' is not a contract, zero is returned.",
    params: [
      {
        name: "contractId",
        documentation: "The target contract",
      },
    ],
  },
  getCurrentBalance: {
    signature: "long getCurrentBalance()",
    detail: "Gets the current balance",
    documentation:
      "Returns the contract balance (NQT/Planck) at the time the instruction is executed.",
    params: [],
  },
  getCurrentBalanceFx: {
    signature: "fixed getCurrentBalanceFx()",
    detail: "Gets the current balance",
    documentation:
      "Returns the contract balance (Signa) at the time the instruction is executed.",
    params: [],
  },
  getAssetBalance: {
    signature: "long getAssetBalance(long assetId)",
    detail:
      "Returns the contract balance of the given 'assetId' at the time the instruction is executed.",
    documentation:
      "Returns the contract balance of the given 'assetId' at the time the instruction is executed.\nIf 'assetId' is zero, the return value is the same as `getCurrentBalance`.",
    params: [
      {
        name: "assetId",
        documentation: "assetId' at the time the instruction is executed.",
      },
    ],
  },
  setMapValue: {
    signature: "void setMapValue(long key1, long key2, long value)",
    detail: "Sets to 'value' the map at 'currentContract[key1][key2]",
    documentation:
      "Sets to 'value' the map at 'currentContract[key1][key2]\n\n" +
      "Maps offer 'unlimited' space to store values. Each stored value (64-bit long or fixed) can be found using two keys (64-bit longs) to be read or written.\n" +
      "Any item that was not previously set, has zero value. No deletion is possible, just set to zero if needed.",
    params: [
      {
        name: "key1",
        documentation: "First Key",
      },
      {
        name: "key2",
        documentation: "Second Key",
      },
      {
        name: "value",
        documentation: "Value",
      },
    ],
  },
  setMapValueFx: {
    signature: "void setMapValueFx(long key1, long key2, fixed value)",
    detail: "Sets to 'value' the map at 'currentContract[key1][key2]",
    documentation:
      "Sets to 'value' the map at 'currentContract[key1][key2]\n\n" +
      "Maps offer 'unlimited' space to store values. Each stored value (64-bit long or fixed) can be found using two keys (64-bit longs) to be read or written.\n" +
      "Any item that was not previously set, has zero value. No deletion is possible, just set to zero if needed.",
    params: [
      {
        name: "key1",
        documentation: "First Key",
      },
      {
        name: "key2",
        documentation: "Second Key",
      },
      {
        name: "value",
        documentation: "Value as Signa fixed value",
      },
    ],
  },
  getMapValue: {
    signature: "long getMapValue(long key1, long key2)",
    detail: "Gets the 'value' from map at 'currentContract[key1][key2]",
    documentation:
      "Sets to 'value' the map at 'currentContract[key1][key2]\n\n" +
      "Maps offer 'unlimited' space to store values. Each stored value (64-bit long or fixed) can be found using two keys (64-bit longs) to be read or written.\n" +
      "Any item that was not previously set, has zero value. No deletion is possible, just set to zero if needed.",
    params: [
      {
        name: "key1",
        documentation: "First Key",
      },
      {
        name: "key2",
        documentation: "Second Key",
      },
    ],
  },
  getMapValueFx: {
    signature: "fixed getMapValueFx(long key1, long key2)",
    detail:
      "Gets the 'value' from map at 'currentContract[key1][key2] in fixed format",
    documentation:
      "Sets to 'value' the map at 'currentContract[key1][key2]\n\n" +
      "Maps offer 'unlimited' space to store values. Each stored value (64-bit long or fixed) can be found using two keys (64-bit longs) to be read or written.\n" +
      "Any item that was not previously set, has zero value. No deletion is possible, just set to zero if needed.",
    params: [
      {
        name: "key1",
        documentation: "First Key",
      },
      {
        name: "key2",
        documentation: "Second Key",
      },
    ],
  },
  getExtMapValue: {
    signature: "long getExtMapValue(long key1, long key2, long contractId)",
    detail: "Gets the map stored at external contract 'contractId[key1][key2]",
    documentation:
      "Gets the map stored at external contract 'contractId[key1][key2]'.\n" +
      "If the contract has no map, or 'contractId' is not a contract, zero is returned.\n" +
      "Unlike the contract memory, the map values from other contracts can be retrieved using this function.\n\n" +
      "Maps offer 'unlimited' space to store values. Each stored value (64-bit long or fixed) can be found using two keys (64-bit longs) to be read or written.\n" +
      "Any item that was not previously set, has zero value. No deletion is possible, just set to zero if needed.",
    params: [
      {
        name: "key1",
        documentation: "First Key",
      },
      {
        name: "key2",
        documentation: "Second Key",
      },
      {
        name: "contractId",
        documentation: "The external contract Id",
      },
    ],
  },
  getExtMapValueFx: {
    signature: "fixed getExtMapValueFx(long key1, long key2, long contractId)",
    detail:
      "Gets the map stored at external contract 'contractId[key1][key2] as fixed value",
    documentation:
      "Gets the map stored at external contract 'contractId[key1][key2]'.\n" +
      "If the contract has no map, or 'contractId' is not a contract, zero is returned.\n" +
      "Unlike the contract memory, the map values from other contracts can be retrieved using this function.\n\n" +
      "Maps offer 'unlimited' space to store values. Each stored value (64-bit long or fixed) can be found using two keys (64-bit longs) to be read or written.\n" +
      "Any item that was not previously set, has zero value. No deletion is possible, just set to zero if needed.",
    params: [
      {
        name: "key1",
        documentation: "First Key",
      },
      {
        name: "key2",
        documentation: "Second Key",
      },
      {
        name: "contractId",
        documentation: "The external contract Id",
      },
    ],
  },

  checkSignature: {
    signature:
      "long checkSignature(long message2, long message3, long message4, long transaction, long page, long accountId)",
    detail:
      "Checks if the signature of the given 'accountId' in 'transaction' at 'page' and 'page+1' matches for the given 'message2..4'.",
    documentation:
      "Checks if the signature of the given 'accountId' in 'transaction' at 'page' and 'page+1' matches for the given 'message2..4'.\nReturns 1 (true) if the signature is valid, 0 otherwise.",
    params: [
      {
        name: "message2",
        documentation: "",
      },
      {
        name: "message3",
        documentation: "",
      },
      {
        name: "message4",
        documentation: "",
      },
      {
        name: "transaction",
        documentation:
          "transaction' at 'page' and 'page+1' matches for the given 'message2.",
      },
      {
        name: "page",
        documentation: "page' and 'page+1' matches for the given 'message2.",
      },
      {
        name: "accountId",
        documentation:
          "accountId' in 'transaction' at 'page' and 'page+1' matches for the given 'message2.",
      },
    ],
  },
  issueAsset: {
    signature: "long issueAsset(long name1, long name2, long decimals)",
    detail: "Issue a new asset and returns its Id.",
    documentation:
      "Issue a new asset and returns its Id.\nAsset name must have between 3 and 10 chars. Only uppercase letters, lowercase letters, and numbers are allowed.\nThe first 8 chars are specified in 'name1' and the remaining in 'name2'.\nSet 'name2' to 0 or \"\" if the name has 8 or less chars.\nThe decimal limits are 0 to 8 decimals.\nIt costs 150 Signa to issue an asset. The contract execution will be halted at this instruction until the balance is reached.",
    params: [
      {
        name: "name1",
        documentation: "First 8 chars of name.",
      },
      {
        name: "name2",
        documentation: "Last 2 chars of name. Keep `0` if token name is less or equal 8 characters",
      },
      {
        name: "decimals",
        documentation: "Number of decimals",
      },
    ],
  },
  mintAsset: {
    signature: "void mintAsset(long quantity, long assetId)",
    detail: "Mint the 'quantity' of 'assetId'.",
    documentation:
      "Mint the 'quantity' of 'assetId'.\nThe asset must be issued by the contract.\nNo negative quantity allowed, send them send to accountId 0 to burn.\nMinted quantity is available right after the instruction.",
    params: [
      {
        name: "quantity",
        documentation: "quantity' of 'assetId'.",
      },
      {
        name: "assetId",
        documentation: "assetId'.",
      },
    ],
  },
  "distributeToHolders": {
    "signature": "void distributeToHolders(long holdersAssetMinQuantity, long holdersAsset, long amountToDistribute, long assetToDistribute, long quantityToDistribute)",
    "detail": "Distribute Planck and/or assets to token holders",
    "documentation": "Distribute the Planck 'amountToDistribute' and 'quantityToDistribute' of 'assetToDistribute' to accounts that hold at least 'holdersAssetMinQuantity' of 'holdersAsset'.\n" +
      "If 'amountToDistribute' and 'quantityToDistribute' are zero, no distribution is done.\n" +
      "Both 'amountToDistribute' and 'quantityToDistribute' can be distributed in same transaction.\n" +
      "Only the free balance is taken in account, this means, if there is quantity in sell orders, they will not be considered.\n" +
      "If current block already has the maximum indirect transactions, no distribution is done.\n" +
      "If no holders have more than the minimum quantity, no distribution is done.\n" +
      "Configured treasury accounts will not join dividends distributed.\n" +
      "The 'assetToDistribute' can be the same as 'holdersAsset' and, in this case, the contract will join the distribution (verify).",
    "params": [
      {
        "name": "holdersAssetMinQuantity",
        "documentation": "Threshold of minimum quantity need to be hold by receiving token holder"
      },
      {
        "name": "holdersAsset",
        "documentation": "The target asset"
      },
      {
        "name": "amountToDistribute",
        "documentation": "Amount in Planck to be distributed"
      },
      {
        "name": "assetToDistribute",
        "documentation": "Additional asset to be distributed"
      },
      {
        "name": "quantityToDistribute",
        "documentation": "Asset Quantity to be distributed"
      }
    ]
  },
  "distributeToHoldersFx": {
    "signature": "void distributeToHoldersFx(long holdersAssetMinQuantity, long holdersAsset, fixed amountToDistribute, long assetToDistribute, long quantityToDistribute)",
    "detail": "Distribute Signa and/or assets to token holders",
    "documentation": "Distribute the Signa 'amountToDistribute' and 'quantityToDistribute' of 'assetToDistribute' to accounts that hold at least 'holdersAssetMinQuantity' of 'holdersAsset'.\n" +
      "If 'amountToDistribute' and 'quantityToDistribute' are zero, no distribution is done.\n" +
      "Both 'amountToDistribute' and 'quantityToDistribute' can be distributed in same transaction.\n" +
      "Only the free balance is taken in account, this means, if there is quantity in sell orders, they will not be considered.\n" +
      "If current block already has the maximum indirect transactions, no distribution is done.\n" +
      "If no holders have more than the minimum quantity, no distribution is done.\n" +
      "Configured treasury accounts will not join dividends distributed.\n" +
      "The 'assetToDistribute' can be the same as 'holdersAsset' and, in this case, the contract will join the distribution (verify).",
    "params": [
      {
        "name": "holdersAssetMinQuantity",
        "documentation": "Threshold of minimum quantity need to be hold by receiving token holder"
      },
      {
        "name": "holdersAsset",
        "documentation": "The target asset"
      },
      {
        "name": "amountToDistribute",
        "documentation": "Amount in Signa to be distributed"
      },
      {
        "name": "assetToDistribute",
        "documentation": "Additional asset to be distributed"
      },
      {
        "name": "quantityToDistribute",
        "documentation": "Asset Quantity to be distributed"
      }
    ]
  },
  "getAssetHoldersCount": {
    "signature": "long getAssetHoldersCount(long minimumQuantity, long assetId)",
    "detail": "Returns the number of holders that have at least 'minimumQuantity' of 'assetId'.",
    "documentation": "Returns the number of holders that have at least 'minimumQuantity' of 'assetId'.\nOnly the free balance is taken in account, this means, if there is quantity in sell orders, they will not be considered.",
    "params": [
      {
        "name": "minimumQuantity",
        "documentation": "minimumQuantity' of 'assetId'."
      },
      {
        "name": "assetId",
        "documentation": "assetId'."
      }
    ]
  },
  "getAssetCirculating": {
    "signature": "long getAssetCirculating(long assetId)",
    "detail": "Returns the quantity of 'assetId' currently in circulation.",
    "documentation": "Returns the quantity of 'assetId' currently in circulation.\n* Note that some quantities are not considered:\n  1) In treasury accounts;\n  2) In sell orders;\n  3) In accountId zero (burn address).",
    "params": [
      {
        "name": "assetId",
        "documentation": "Target assetId"
      }
    ]
  },
  "getAccountBalance": {
    "signature": "long getAccountBalance(long accountId)",
    "detail": "Get accounts balance in Planck",
    "documentation": "Returns the Planck balance owned by 'accountId'.\n" +
      "If there is no accountId, returns zero.\n" +
      "When used to get the balances from smart contracts, it will return the balance on last block, not the one after the execution on current block.\n" +
      "Same applies to get the own contract balance, which is the same as signum API Get_Previous_Balance and most of times not useful.\n" +
      "* Note that some parts of the balance are also considered:\n" +
      "  1) Commitment.",
    "params": [
      {
        "name": "accountId",
        "documentation": "Target Account"
      }
    ]
  },
  "getAccountBalanceFx": {
    "signature": "fixed getAccountBalanceFx(long accountId)",
    "detail": "Get accounts balance in Signa",
    "documentation": "Returns the Signa balance owned by 'accountId'.\n" +
      "If there is no accountId, returns zero.\n" +
      "When used to get the balances from smart contracts, it will return the balance on last block, not the one after the execution on current block.\n" +
      "Same applies to get the own contract balance, which is the same as signum API Get_Previous_Balance and most of times not useful.\n" +
      "* Note that some parts of the balance are also considered:\n" +
      "  1) Commitment.",
    "params": [
      {
        "name": "accountId",
        "documentation": "Target Account"
      }
    ]
  },
  "getAccountAssetQuantity": {
    "signature": "long getAccountAssetQuantity(long accountId, long assetId)",
    "detail": "Returns the quantity of 'assetId'",
    "documentation": "Returns the quantity of 'assetId' owned by 'accountId'.\n" +
      "When used to get the balances from smart contracts, it will return the balance on last block, not the one after the execution on current block.\n" +
      "* Note that some quantities are also considered:\n" +
      "  1) In sell orders.",
    "params": [
      {
        "name": "accountId",
        "documentation": "Target Account"
      },
      {
        "name": "assetId",
        "documentation": "Target Asset"
      }
    ]
  },
  "mdv": {
    "signature": "long mdv(long m1, long m2, long div)",
    "detail": "Computes the value of `m1` multiplied by `m2` with 128-bit precision (no overflow) and then divides this result by `div`.",
    "documentation": "Computes the value of `m1` multiplied by `m2` with 128-bit precision (no overflow) and then divides this result by `div`.\nThe calculation is returned as value.\n* Notes:\n  1) This instruction will be used in optimizations, even if not explicit declared. Use this form to ensure the instruction, or check generated assembly code if in doubt.",
    "params": [
      {
        "name": "m1",
        "documentation": "m1` multiplied by `m2` with 128-bit precision (no overflow) and then divides this result by `div`."
      },
      {
        "name": "m2",
        "documentation": "m2` with 128-bit precision (no overflow) and then divides this result by `div`."
      },
      {
        "name": "div",
        "documentation": "div`."
      }
    ]
  },
  "pow": {
    "signature": "long pow(long base, long expBy1e8)",
    "detail": "Computes the value of `base` to the power of `expBy1e8`, where expBy1e8 is used as fixed point representation with 8 decimals (like the values in Signa). The result is returned as long value, decimals are truncated.",
    "documentation": "Computes the value of `base` to the power of `expBy1e8`, where expBy1e8 is used as fixed point representation with 8 decimals (like the values in Signa). The result is returned as long value, decimals are truncated.\n* Examples:\n  * sqrt(49) = 7 :: `val = pow(49, 5000_0000);`\n  * 5 * 5 * 5 * 5 = 5^4 = 625 :: `val = pow(5, 4_0000_0000);`\n  * sqrt(48) = 6 :: `val = pow(48, 5000_0000);`\n* Notes\n  1) pow will return zero if the result is matematically undefined;\n  2) pow will return zero if base is negative;\n  3) pow will return zero if result is greater than 9223372036854775807 (max positive long).",
    "params": [
      {
        "name": "base",
        "documentation": "base` to the power of `expBy1e8`, where expBy1e8 is used as fixed point representation with 8 decimals (like the values in Signa)."
      },
      {
        "name": "expBy1e8",
        "documentation": "expBy1e8`, where expBy1e8 is used as fixed point representation with 8 decimals (like the values in Signa)."
      }
    ]
  },
  "powf": {
    "signature": "long powf(long base, fixed exp)",
    "detail": "Same as `pow` but using fixed point number for the exponent.",
    "documentation": "Same as `pow` but using fixed point number for the exponent.\n* Examples:\n  * sqrt(49) = 7 :: `val = powf(49, 0.5);`\n  * 5 * 5 * 5 * 5 = 5^4 = 625 :: `val = pow(5, 4.0);`\n  * sqrt(48) = 6 :: `val = pow(48, .5);`\n* Notes\n  1) pow will return zero if the result is matematically undefined;\n  2) pow will return zero if base is negative;\n  3) pow will return zero if result is greater than 9223372036854775807 (max positive long).",
    "params": [
      {
        "name": "base",
        "documentation": "base is negative;\n  3) pow will return zero if result is greater than 9223372036854775807 (max positive long)."
      },
      {
        "name": "exp",
        "documentation": ""
      }
    ]
  },
  "memcopy": {
    "signature": "void memcopy(void * destination, void * source)",
    "detail": "Copies the binary value from source to destination. Handyful to copy variables content without type casting modifying them.",
    "documentation": "Copies the binary value from source to destination. Handyful to copy variables content without type casting modifying them.\n* Example:\n  * `fixed f; long l; memcopy(&f, &l);` This will copy the binary data from variable `l` to `f` without transformations. If l is 50, then f will be 0.00000050.",
    "params": [
      {
        "name": "destination",
        "documentation": "destination."
      },
      {
        "name": "source",
        "documentation": "source to destination."
      }
    ]
  },
  "bcftol": {
    "signature": "long bcftol(fixed value)",
    "detail": "Converts long to fixed",
    "documentation": "Creates a binary casting (do not change values in memory) from a long value to fixed.\n" +
      "Examples:\n" +
      "`fixed val; val = bcltof(5000_0000);` Output: val will have content 0.5.",
    "params": [
      {
        "name": "value",
        "documentation": "Fixed value"
      }
    ]
  },
  "bcltof": {
    "signature": "fixed bcltof(long value)",
    "detail":  "Converts fixed to long",
    "documentation": "Creates a binary casting (do not change values in memory) from a long value to fixed.\n" +
      "Examples:\n" +
      "`fixed val; val = bcltof(5000_0000);` Output: val will have content 0.5.",
    "params": [
      {
        "name": "value",
        "documentation": "Long value"
      }
    ]
  }
};
