export type DirectiveDeclaration = {
  detail: string;
  documentation: string;
  /** Snippet for the value part, appended after the property name. Empty when the property takes no value. */
  snippet: string;
};

/** `#program ...` — contract metadata, written to the assembly/deployment output. */
export const SmartCProgramDirectives: Record<string, DirectiveDeclaration> = {
  name: {
    detail: "Program name (mandatory for deployment)",
    documentation:
      "Set program's name. Only regular letters and numbers allowed, max 30 chars in length. A value is mandatory for deployment.",
    snippet: "${1:MyContract}",
  },
  description: {
    detail: "Program description (optional)",
    documentation:
      "Set program's description. No new lines and max length is 1000 chars. This is optional.",
    snippet: "${1:What this contract does}",
  },
  activationAmount: {
    detail:
      "Minimum amount to activate the contract (mandatory for deployment)",
    documentation:
      "Set program's activation amount. If VALUE is fixed point (Example: .34), it is used as Signa amount. If not, the value will be set in NQT (Example: 3400_0000).\n\n" +
      "If an incoming transaction has an amount is less than this value, it will not be processed by program (but the amount will be received!). Set a low value but bigger than worst case amount needed to run in your program. If set too low, your program will be frozen during execution (out of gas). If set too high, program balance will be high after execution (unspent balance). Remember to handle this case if creating serious program! A value is mandatory for deployment.",
    snippet: "${1:0.1}",
  },
  codeHashId: {
    detail: "Enforce the compiled code hash id (optional)",
    documentation:
      "Ensure the compiled program will have this exact code hash id. Use 0 to make this information available at assembly output (during development). Use the actual number if you plan do distribute the source code, so the compiler will raise an error on divergency. This is optional.",
    snippet: "${1:0}",
  },
  codeStackPages: {
    detail: "Pages for the code stack (max 10)",
    documentation:
      "Code pages are used during function calls, to store the instruction pointer return position (also know as Program Counter). Default value is zero if not needed, or one if needed. Every page allows to store 16 values. Tweak this value if using many nested functions or recursive functions. Maximum value is 10 pages.",
    snippet: "${1:1}",
  },
  userStackPages: {
    detail: "Pages for the user stack (max 10)",
    documentation:
      "User pages are used during function calls to pass arguments values, to store function return value, or to store function scope variables during recursive calls. Default value is zero if not needed, or one if needed. Tweak this value if using more than 16 arguments on functions or recursive functions. Maximum value is 10 pages.",
    snippet: "${1:1}",
  },
  creator: {
    detail: "Creator ID — SC-Simulator only",
    documentation:
      "Valid only in SC-Simulator. N must be decimal number. When set, this will set the creator ID of the contract. Use to simulate many contracts deployed from diferent users. It is ignored in machine code generation or during actual deployment.",
    snippet: "${1:0}",
  },
  contract: {
    detail: "Contract ID — SC-Simulator only",
    documentation:
      "Valid only in SC-Simulator. N must be decimal number. When set, this will set the contract ID. Use if deploying many contracts, then the deployment can be made in any order. It is ignored in machine code generation or during actual deployment.",
    snippet: "${1:0}",
  },
};

/** `#pragma ...` — special features used by the compiler. */
export const SmartCPragmaDirectives: Record<string, DirectiveDeclaration> = {
  maxAuxVars: {
    detail: "Number of auxiliary variables / registers (0..10, default 3)",
    documentation:
      "Used to tell compiler how many auxiliary variables will be available (they are used as registers). Default value is 3, min value is 0 and max is 10. If you are under memory pressure, try to reduce to minimal necessary for compiling. Simple contracts will use around 2 values, but this number depends on nested operations.",
    snippet: "${1:3}",
  },
  maxConstVars: {
    detail: "Number of constant variables 'n1'..'n10' (0..10, default 0)",
    documentation:
      "Compiler will create variable from 1 to maxConstVars. Variables will be named 'n1', 'n2', ... 'n10'. It is very usefull to use, because compiler will change all numbers references to these variables and optimize code, making code much much smaller! Default min value is 0 (deactivated) and max is 10.",
    snippet: "${1:1}",
  },
  optimizationLevel: {
    detail: "Code optimizer strategy (0..4, default 2)",
    documentation:
      "Choose strategy for code optimizer. It can be between 0 and 3.\n\n" +
      "* `0`: No optimization.\n" +
      "* `1`: Very basic optimization, just remove silly and unused code.\n" +
      "* `2`: Default. Safely change and/or delete code for smarter outcome.\n" +
      "* `3`: Use a VM to trace variable's content and remove redundant code. Beta feature, to be included as default once more tests are done. Can generate a good optimization reducing the number of calls to API functions.\n" +
      "* `4`: Dangerous optimizations no well tested. Result must be inspected by developer.",
    snippet: "${1|2,0,1,3,4|}",
  },
  reuseAssignedVar: {
    detail: "Reuse the assignment's left side as a register (default true)",
    documentation:
      "When set, compiler will try to use a variable on left side of and Assignment as a register. If variable is also used on right side, the compiler will not reuse it. This can save one assembly instruction for every expression used! Default value is true and it is highly recomended to maintain it active.",
    snippet: "${1|true,false|}",
  },
  verboseAssembly: {
    detail: "Annotate assembly output with source lines",
    documentation:
      "Adds a comment in assembly output with the corresponding line number and the source code. Very usefull for debug.",
    snippet: "${1|true,false|}",
  },
  verboseScope: {
    detail: "Annotate assembly output with register scope info",
    documentation:
      "Adds a comment in assembly output with the free register ever begin/end of scope. Also informs when a register in use as another variable name. Very usefull for debug.",
    snippet: "${1|true,false|}",
  },
  version: {
    detail: "Compiler version the code was developed for (optional)",
    documentation:
      "Informs which compiler's version the code was developed. This is optional but can help future generations. VALUE can be any string or remarks.",
    snippet: "${1:2.3}",
  },
};

export const SmartCDirectives: Record<
  "program" | "pragma",
  {
    detail: string;
    documentation: string;
    properties: Record<string, DirectiveDeclaration>;
  }
> = {
  program: {
    detail: "Contract metadata",
    documentation:
      "Sets the contract's metadata: name, description, activation amount, stack pages and code hash id.",
    properties: SmartCProgramDirectives,
  },
  pragma: {
    detail: "Compiler options",
    documentation: "Special features used by compiler.",
    properties: SmartCPragmaDirectives,
  },
};
