export const SmartCKeywords: Record<string, { detail: string, documentation: string }> =
  {
    "exit": {
      detail: "Stops the contract execution and resets to main",
      documentation: "Puts the contract in 'stop' mode and set program to restart from main function ('finished' mode). It will be inactive until a new transaction is received. Once a tx is received, it will start execution at void main() function. If main function is not defined, the execution will start again from beginning of code, running again all global statements. If the main function is defined, the global statements will be executed only in the first activations of the contract. exit takes no argument. If contract activation amount is zero, contract will resume execution on next block (similar to sleep)"
    },
    "sleep": {
      detail: "Sleeps n blocks",
      documentation: "Puts the contract in 'sleep' mode and resumes contract execution on next block. Alternatively it can have an argument to indicate the number of blocks to sleep and the argument can be an expression. This tree sentences have the same result sleep;, sleep 0;, and sleep 1;, but it is prefered the first one because the instruction is smaller."
    },
    "fixed": {
      detail: "Declares a variable that is a fixed point number",
      documentation: "Declares a variable that is a fixed point number. All fixed numbers have 8 decimals, so it is handy to make Signa calculations with it. It supports positives values from 0.00000001 to 92,233,720,368.54775807 and negative from -0.00000001 to -92,233,720,368.54775808. They are internally a signed 64-bit number."
    },
    "halt": {
      detail: "Contract will be inactive until a next transaction",
      documentation: "Puts the contract in 'stop' mode. It will be inactive until a new transaction is received, then it will resume execution at next instruction. It takes no argument. If contract activation amount is zero, contract will resume execution on next block."
    }
  };


export const SmartCDisabledKeywords = [
  "auto",
  "double",
  "float",
  "volatile",
  "char",
  "enum",
  "extern",
  "int",
  "short",
  "signed",
  "static",
  "typedef",
  "union",
  "unsigned",
];
